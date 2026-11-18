#!/usr/bin/env bash
# Lifecycle of the local Next.js dev server: status / start / restart / stop.
# The port is fixed — a stale server can never make Next silently pick another
# one and leave a second server behind. Only this site's server is stopped; a
# foreign listener on the port is reported and left alone.
# Usage: scripts/dev-server.sh status|start|restart|stop
# Env: PORT (default 3001)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-3001}"
URL="http://localhost:$PORT/"
STATE="$ROOT/.dev-server"
LOG="$STATE/dev.log"
PIDFILE="$STATE/dev.pid"

listeners() {
    lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null || true
}

# Walk the ancestor chain: a Next dev server is npm -> next dev -> next-server,
# and the TCP listener is the grandchild. Matching "next" anywhere up the tree
# also finds an orphaned server from an older session with no pidfile.
is_ours() {
    local pid="$1" cmd
    while [ -n "$pid" ] && [ "$pid" != "1" ] && [ "$pid" != "0" ]; do
        cmd="$(ps -p "$pid" -o command= 2>/dev/null || true)"
        case "$cmd" in
            *next*|*npm\ run\ dev*) return 0 ;;
        esac
        pid="$(ps -p "$pid" -o ppid= 2>/dev/null | tr -d ' ' || true)"
    done
    return 1
}

our_listener() {
    local pid
    for pid in $(listeners); do
        if is_ours "$pid"; then
            echo "$pid"
            return 0
        fi
    done
    return 0
}

# Kill from the top of our tree, descendants first — killing only next-server
# leaves its npm/next dev parents behind, and they can respawn it.
kill_tree() {
    local pid="$1" child
    for child in $(pgrep -P "$pid" 2>/dev/null || true); do
        kill_tree "$child"
    done
    kill "$pid" 2>/dev/null || true
}

our_root() {
    local pid="$1" parent
    while true; do
        parent="$(ps -p "$pid" -o ppid= 2>/dev/null | tr -d ' ' || true)"
        [ -n "$parent" ] && [ "$parent" != "1" ] && [ "$parent" != "0" ] || break
        is_ours "$parent" || break
        pid="$parent"
    done
    echo "$pid"
}

wait_up() {
    # A 200 is enough: start() refuses a foreign listener before launching,
    # and the first compiled responses may not carry the <title> yet.
    for _ in $(seq 1 60); do
        if curl -sf -o /dev/null "$URL" 2>/dev/null; then
            return 0
        fi
        sleep 0.5
    done
    return 1
}

status() {
    local pid foreign
    pid="$(our_listener)"
    if [ -n "$pid" ]; then
        echo "running (pid $pid) — $URL"
        return 0
    fi
    foreign="$(listeners | head -1)"
    if [ -n "$foreign" ]; then
        echo "port $PORT is held by another process (pid $foreign): $(ps -p "$foreign" -o command=)"
    else
        echo "not running"
    fi
}

stop() {
    local pid root stopped=0
    if [ -f "$PIDFILE" ]; then
        pid="$(cat "$PIDFILE")"
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            kill_tree "$pid"
            echo "stopped (pid $pid)"
            stopped=1
        fi
        rm -f "$PIDFILE"
    fi
    # orphaned from an older session — no pidfile, but still our process tree
    for pid in $(listeners); do
        if is_ours "$pid"; then
            root="$(our_root "$pid")"
            kill_tree "$root"
            echo "stopped stale server (pid $root)"
            stopped=1
        fi
    done
    # the port frees before the children fully exit; wait, then force the rest
    for _ in $(seq 1 30); do
        [ -z "$(listeners)" ] && break
        sleep 0.5
    done
    for pid in $(listeners); do
        if is_ours "$pid"; then
            kill -9 "$pid" 2>/dev/null || true
        fi
    done
    [ "$stopped" -eq 1 ] || echo "not running"
}

start() {
    local pid foreign server_pid
    pid="$(our_listener)"
    if [ -n "$pid" ]; then
        if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
            echo "already running (pid $pid) — $URL"
            return 0
        fi
        echo "stale server (pid $pid) on $PORT — restarting it"
        stop
    fi
    foreign="$(listeners | head -1)"
    if [ -n "$foreign" ]; then
        echo "port $PORT is held by another process (pid $foreign): $(ps -p "$foreign" -o command=)" >&2
        echo "stop it or use PORT=<other> scripts/dev-server.sh start" >&2
        return 1
    fi
    mkdir -p "$STATE"
    cd "$ROOT"
    # detached: outlives the agent session. The explicit port keeps Next from
    # drifting to 3002 and leaving yet another server behind.
    nohup npm run dev -- -p "$PORT" >"$LOG" 2>&1 &
    server_pid=$!
    echo "$server_pid" >"$PIDFILE"
    if wait_up; then
        echo "started (pid $server_pid) — $URL"
    else
        echo "started (pid $server_pid) but not answering; log tail:" >&2
        tail -5 "$LOG" >&2
        return 1
    fi
}

case "${1:-}" in
    status) status ;;
    start) start ;;
    restart)
        stop
        start
        ;;
    stop) stop ;;
    *)
        echo "usage: $0 status|start|restart|stop" >&2
        exit 1
        ;;
esac
