"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type TouchEvent,
} from "react";
import { regionName } from "@/lib/cdn";
import type { MediumSpeedCamera, RoadRepair, StationaryCamera } from "@/lib/cdn";

export type Detail =
  | { kind: "stationary"; camera: StationaryCamera }
  | { kind: "mediumSpeed"; camera: MediumSpeedCamera }
  | { kind: "repairs"; repair: RoadRepair };

type DetailPanelProps = {
  // null — the ?marker= link points at an id the current data no longer
  // carries (the CDN rotates); the panel renders its not-found face.
  detail: Detail | null;
  onClose: () => void;
  // A URL open (a fresh load or a resurrected tab) is not a user gesture —
  // showing the panel without the entry animation keeps it from looking
  // like a fresh click every time the browser is brought back.
  fromUrl: boolean;
};

// The dashboard's speed meta (screens/speed: the CAR_ICON/TRUCK_ICON pair
// over the same mask-drawn svg-icons): each limit reads icon + number with
// its own unit, and the truck figure only appears when the CDN carries one.
function SpeedValue({ car, truck }: { car: number; truck: number }) {
  return (
    <span className="speed-value">
      <span className="speed-limit">
        <span className="svg-icon icon-car" aria-hidden="true" />
        {car} км/ч
      </span>
      {truck > 0 && (
        <span className="speed-limit">
          <span className="svg-icon icon-truck" aria-hidden="true" />
          {truck} км/ч
        </span>
      )}
    </span>
  );
}

// The CDN dates are ISO YYYY-MM-DD; the panel reads them as DD.MM.YYYY.
// Anything without that shape passes through untouched.
function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return year && month && day ? `${day}.${month}.${year}` : iso;
}

// The CDN's distance rides in km with at most one decimal (the pipeline's
// geo math rounds there); the panel keeps the source's dot decimal and
// drops a lone ".0" on whole kilometers.
function formatDistance(km: number): string {
  const rounded = Math.round(km * 10) / 10;
  return `${rounded.toString().replace(".0", "")} км`;
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="detail-row">
      <span className="detail-label">{label}</span>
      <span className="detail-value">{value}</span>
    </div>
  );
}

// The kind badge in the header reuses the same artwork files as the filter
// panel and the map markers — the icon matches what was tapped, so the type
// reads without parsing the title. The artwork carries no text, so the
// screen reader gets the kind's name alongside.
const KIND_META: Record<Detail["kind"], { icon: string; name: string }> = {
  stationary: { icon: "/icons/camera.svg", name: "Стационарная камера" },
  mediumSpeed: { icon: "/icons/medium-speed.svg", name: "Средняя скорость" },
  repairs: { icon: "/icons/road-repairs-point.svg", name: "Ремонт дороги" },
};

function detailRows(detail: Detail) {
  if (detail.kind === "stationary") {
    const camera = detail.camera;
    return (
      <>
        <Row label="Скорость" value={<SpeedValue car={camera.speedCar} truck={camera.speedTruck} />} />
        <Row
          label="Направление"
          value={camera.bidirectional ? "Двухсторонняя" : "Односторонняя"}
        />
        <Row label="Область" value={regionName(camera.region)} />
        <Row label="Проверен" value={camera.verified ? "Да" : "Нет"} />
        <Row label="Обновлено" value={formatDate(camera.updateTime)} />
      </>
    );
  }
  if (detail.kind === "mediumSpeed") {
    const camera = detail.camera;
    return (
      <>
        <Row label="Скорость" value={<SpeedValue car={camera.speedCar} truck={camera.speedTruck} />} />
        <Row
          label="Направление"
          value={camera.bidirectional ? "Двухсторонняя" : "Односторонняя"}
        />
        {camera.distance !== undefined && (
          <Row label="Расстояние" value={formatDistance(camera.distance)} />
        )}
        <Row label="Область" value={regionName(camera.region)} />
        <Row label="Проверен" value={camera.verified ? "Да" : "Нет"} />
        <Row label="Обновлено" value={formatDate(camera.updateTime)} />
      </>
    );
  }
  const repair = detail.repair;
  return (
    <>
      <Row
        label="Даты"
        value={`${formatDate(repair.dateBegin)} — ${formatDate(repair.dateEnd)}`}
      />
      {repair.speed > 0 && (
        <Row label="Ограничение" value={`${repair.speed} км/ч`} />
      )}
      {repair.distance !== undefined && (
        <Row label="Расстояние" value={formatDistance(repair.distance)} />
      )}
      <Row label="Область" value={regionName(repair.region)} />
      <Row label="Проверен" value={repair.verified ? "Да" : "Нет"} />
      <Row label="Обновлено" value={formatDate(repair.updateTime)} />
    </>
  );
}

// The detail surface, a drawer by the design-doctrine spec: a bottom sheet on
// mobile, a right side panel from 768px (the skins live in globals.css).
// role="dialog" + aria-modal: the map behind is inert while the panel is open,
// so Tab cycles inside it naturally and no trap code is needed.
export default function DetailPanel({
  detail,
  onClose,
  fromUrl,
}: DetailPanelProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const touchStartY = useRef<number | null>(null);
  // The exit plays before the unmount: every close request flips this flag,
  // the closing animations run, and the real onClose fires on animationend
  // (with a timer as the fallback for a skipped animation).
  const [closing, setClosing] = useState(false);
  const requestClose = useCallback(() => setClosing(true), []);

  // One-time swipe hint: on the first sheet open on mobile the drag handle
  // bounces twice after landing — the only affordance for the swipe-down
  // close. Remembered in localStorage like every other one-shot flag.
  const [hint, setHint] = useState(() => {
    if (typeof window === "undefined" || window.matchMedia("(min-width: 768px)").matches) {
      return false;
    }
    try {
      if (localStorage.getItem("swipe-hint") !== null) {
        return false;
      }
      localStorage.setItem("swipe-hint", "1");
    } catch {
      return false;
    }
    return true;
  });
  useEffect(() => {
    if (!hint) {
      return;
    }
    const timer = setTimeout(() => setHint(false), 3000);
    return () => clearTimeout(timer);
  }, [hint]);

  useEffect(() => {
    if (!closing) {
      return;
    }
    // The timer covers a skipped animationend; the handler below normally
    // unmounts first.
    const timer = setTimeout(onClose, 400);
    return () => clearTimeout(timer);
  }, [closing, onClose]);

  // Entry animations end here too — the flag filters them out.
  const onPanelAnimationEnd = () => {
    if (closing) {
      onClose();
    }
  };

  const title = detail
    ? detail.kind === "repairs"
      ? detail.repair.road
      : detail.camera.name
    : "Не найдено";

  // Share: the selected marker already rides the URL as ?marker=<id>, but
  // nothing on the panel said so. navigator.share opens the OS sheet on
  // mobile; where it doesn't exist (desktop) the link lands on the
  // clipboard with a brief "Скопировано" on the button itself. A user
  // canceling the OS sheet rejects the promise — that's not an error face.
  const [copied, setCopied] = useState(false);
  const share = useCallback(() => {
    const url = window.location.href;
    if (typeof navigator.share === "function") {
      void navigator.share({ title, url }).catch(() => {});
      return;
    }
    void navigator.clipboard?.writeText(url).then(
      () => setCopied(true),
      () => {},
    );
  }, [title]);
  useEffect(() => {
    if (!copied) {
      return;
    }
    // The dashboard's uikit success toast lives 4s; the share glyph swap
    // rides the same window.
    const timer = setTimeout(() => setCopied(false), 4000);
    return () => clearTimeout(timer);
  }, [copied]);

  useEffect(() => {
    // The dialog pattern (aria-patterns.md): focus moves into the panel on
    // open and returns to the trigger (the marker that was focused) on close.
    // The focus lands on the panel container itself — a tabindex=-1 div —
    // not on the close button: script focus on a button matches
    // :focus-visible in Chrome, which painted the ring right after a tap.
    const opener = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        requestClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, [requestClose]);

  // Swipe the sheet down past ~80px to close; a shorter drag springs back.
  const onTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    touchStartY.current = event.touches[0].clientY;
  };

  const onTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    if (touchStartY.current === null) {
      return;
    }
    const dy = event.touches[0].clientY - touchStartY.current;
    if (dy > 0) {
      event.currentTarget.style.transform = `translateY(${dy}px)`;
    }
  };

  const onTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    if (touchStartY.current === null) {
      return;
    }
    touchStartY.current = null;
    const panel = event.currentTarget;
    const dy = /translateY\((\d+)/.exec(panel.style.transform);
    panel.style.transform = "";
    if (dy && Number(dy[1]) > 80) {
      requestClose();
      return;
    }
    panel.style.transition = "transform 200ms ease-out";
    setTimeout(() => {
      panel.style.transition = "";
    }, 200);
  };

  return (
    <>
      <div
        className={`detail-backdrop${closing ? " detail-closing" : ""}`}
        onClick={requestClose}
      />
      <div
        ref={panelRef}
        className={`detail-panel${
          closing ? " detail-closing" : fromUrl ? " detail-instant" : ""
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-title"
        tabIndex={-1}
        onAnimationEnd={onPanelAnimationEnd}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div
          className={`drag-handle${hint ? " drag-handle-hint" : ""}`}
          aria-hidden="true"
        />
        <div className="detail-header">
          <div className="detail-heading">
            {detail && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="detail-kind-icon"
                  src={KIND_META[detail.kind].icon}
                  alt=""
                />
                <span className="sr-only">{KIND_META[detail.kind].name}</span>
              </>
            )}
            {/* On the not-found face the empty state below says it all — the
               title stays only for the screen-reader dialog label. */}
            <h2
              className={`detail-title${detail ? "" : " sr-only"}`}
              id="detail-title"
            >
              {title}
            </h2>
          </div>
          {/* The not-found face has its own Понятно action — a second close
             control in the header would be redundant. */}
          {detail && (
            <div className="detail-actions">
              <button
                type="button"
                className="detail-share"
                onClick={share}
                aria-label={copied ? "Ссылка скопирована" : "Поделиться ссылкой"}
                title={copied ? "Ссылка скопирована" : "Поделиться ссылкой"}
              >
                {/* One-off stateful glyphs, inline in currentColor per the
                    icon conventions: the iOS-style share square, and the
                    copied check in the same stroke metrics — the bare ✓
                    text glyph read thin next to the drawn icon. */}
                <svg
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  {copied ? (
                    <path d="m4.5 12.5 5 5 10-10.5" />
                  ) : (
                    <>
                      <path d="M12 3v11" />
                      <path d="m7.5 7.5 4.5-4.5 4.5 4.5" />
                      <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
                    </>
                  )}
                </svg>
              </button>
              <button
                type="button"
                className="detail-close"
                onClick={requestClose}
                aria-label="Закрыть"
              >
                ✕
              </button>
            </div>
          )}
          {/* The screen-reader announcement rides an always-mounted live
             region inside the dialog; the visible toast is the uikit card
             parked at the screen's bottom-right. */}
          <p className="sr-only" role="status">
            {copied ? "Ссылка скопирована" : ""}
          </p>
        </div>
        <div className="detail-rows">
          {detail ? (
            detailRows(detail)
          ) : (
            // The stale-link face: a compact centered empty state. The
            // header above already says "Не найдено"; the unlink glyph — the
            // chain halves pulled apart — is a one-off inline svg in
            // currentColor (the icon conventions).
            <div className="detail-empty">
              <div className="detail-empty-icon" aria-hidden="true">
                <svg
                  className="detail-empty-glyph"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m3.5 16.5l3-3a2.83 2.83 0 0 1 4 4l-3 3a2.83 2.83 0 0 1-4-4" />
                  <path d="m20.5 7.5l-3 3a2.83 2.83 0 0 1-4-4l3-3a2.83 2.83 0 0 1 4 4" />
                  <path d="M9 9L7 7m8 8l2 2" />
                </svg>
              </div>
              <p className="detail-empty-text">
                Ссылка устарела: объект удален или перемещен.
              </p>
              <button
                type="button"
                className="detail-empty-close"
                onClick={requestClose}
              >
                Понятно
              </button>
            </div>
          )}
        </div>
        {detail?.kind === "repairs" && detail.repair.note && (
          <p className="detail-note">{detail.repair.note}</p>
        )}
      </div>
      {/* The visible copy toast: the dashboard's uikit card — surface fill,
         the ok-colored left edge — fixed bottom-right above the panel and
         its backdrop. A tap dismisses it early, like the dashboard's toasts.
         aria-hidden because the dialog's live region above already announces
         the text. */}
      <div
        className={`share-toast${copied ? " share-toast-shown" : ""}`}
        aria-hidden="true"
        onClick={() => setCopied(false)}
      >
        Ссылка скопирована
      </div>
    </>
  );
}
