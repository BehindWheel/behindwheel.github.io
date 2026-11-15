// Shareable detail links: the selected marker rides the URL as
// ?marker=<kind>:<id>. Query format — GitHub Pages serves the static export
// without rewrites, so a deep path would land on 404.html before the app
// ever sees the id.
import type { SelectionKind } from "./map/markers";

const MARKER_PARAM = "marker";

const KINDS: readonly string[] = ["stationary", "mediumSpeed", "repairs"];

// "unknown" kind — the param is there but the kind or id part doesn't parse;
// the panel renders its not-found face for it.
export type MarkerParam = {
  kind: SelectionKind | "unknown";
  id: string;
};

export function parseMarkerParam(search: string): MarkerParam | null {
  const raw = new URLSearchParams(search).get(MARKER_PARAM);
  if (!raw) {
    return null;
  }
  const sep = raw.indexOf(":");
  const kind = sep === -1 ? "" : raw.slice(0, sep);
  const id = sep === -1 ? "" : raw.slice(sep + 1);
  if (KINDS.includes(kind) && id) {
    return { kind: kind as SelectionKind, id };
  }
  return { kind: "unknown", id: id || raw };
}

// The search string for the current selection, or "" when nothing is
// selected — the caller splices it onto the live URL. An "unknown" kind
// serializes as-is and round-trips back to "unknown" through the parser.
export function markerSearch(
  selected: { kind: SelectionKind | "unknown"; id: string } | null,
): string {
  if (!selected) {
    return "";
  }
  return `?${MARKER_PARAM}=${encodeURIComponent(`${selected.kind}:${selected.id}`)}`;
}
