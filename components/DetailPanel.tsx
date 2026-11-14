"use client";

import { useCallback, useEffect, useRef, useState, type TouchEvent } from "react";
import type { MediumSpeedCamera, RoadRepair, StationaryCamera } from "@/lib/cdn";

export type Detail =
  | { kind: "stationary"; camera: StationaryCamera }
  | { kind: "mediumSpeed"; camera: MediumSpeedCamera }
  | { kind: "repairs"; repair: RoadRepair };

type DetailPanelProps = {
  detail: Detail;
  onClose: () => void;
};

function speedLabel(car: number, truck: number): string {
  return truck > 0 ? `${car} / ${truck} км/ч` : `${car} км/ч`;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-row">
      <span className="detail-label">{label}</span>
      <span className="detail-value">{value}</span>
    </div>
  );
}

function detailRows(detail: Detail) {
  if (detail.kind === "stationary") {
    const camera = detail.camera;
    return (
      <>
        <Row label="Скорость" value={speedLabel(camera.speedCar, camera.speedTruck)} />
        <Row
          label="Направление"
          value={camera.bidirectional ? "Оба направления" : "Одно направление"}
        />
        <Row label="Угол" value={`${camera.angle}°`} />
        <Row label="Регион" value={camera.region} />
        <Row label="Обновлено" value={camera.updateTime} />
      </>
    );
  }
  if (detail.kind === "mediumSpeed") {
    const camera = detail.camera;
    return (
      <>
        <Row label="Скорость" value={speedLabel(camera.speedCar, camera.speedTruck)} />
        <Row
          label="Направление"
          value={
            (camera.bidirectional ? "Оба направления" : "Одно направление") +
            `, ${camera.points.length} точек`
          }
        />
        <Row label="Угол начала" value={`${camera.angleStart}°`} />
        <Row label="Угол конца" value={`${camera.angleEnd}°`} />
        <Row label="Регион" value={camera.region} />
        <Row label="Обновлено" value={camera.updateTime} />
      </>
    );
  }
  const repair = detail.repair;
  return (
    <>
      <Row
        label="Тип"
        value={repair.type === "point" ? "Точечный" : "Участок дороги"}
      />
      <Row label="Даты" value={`${repair.dateBegin} — ${repair.dateEnd}`} />
      {repair.speed > 0 && (
        <Row label="Ограничение" value={`${repair.speed} км/ч`} />
      )}
      {repair.note && <Row label="Заметка" value={repair.note} />}
      <Row label="Проверено" value={repair.verified ? "Да" : "Нет"} />
      <Row label="Регион" value={repair.region} />
      <Row label="Обновлено" value={repair.updateTime} />
    </>
  );
}

// The detail surface, a drawer by the design-doctrine spec: a bottom sheet on
// mobile, a right side panel from 768px (the skins live in globals.css).
// role="dialog" + aria-modal: the map behind is inert while the panel is open,
// so Tab cycles inside it naturally and no trap code is needed.
export default function DetailPanel({ detail, onClose }: DetailPanelProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const touchStartY = useRef<number | null>(null);
  // The exit plays before the unmount: every close request flips this flag,
  // the closing animations run, and the real onClose fires on animationend
  // (with a timer as the fallback for a skipped animation).
  const [closing, setClosing] = useState(false);
  const requestClose = useCallback(() => setClosing(true), []);

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

  const title =
    detail.kind === "repairs" ? detail.repair.road : detail.camera.name;

  useEffect(() => {
    // The dialog pattern (aria-patterns.md): focus moves into the panel on
    // open and returns to the trigger (the marker that was focused) on close.
    const opener = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector("button")?.focus();
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
        className={`detail-panel${closing ? " detail-closing" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-title"
        onAnimationEnd={onPanelAnimationEnd}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div className="drag-handle" aria-hidden="true" />
        <div className="detail-header">
          <h2 className="detail-title" id="detail-title">
            {title}
          </h2>
          <button
            type="button"
            className="detail-close"
            onClick={requestClose}
            aria-label="Закрыть"
          >
            ✕
          </button>
        </div>
        {detail.kind === "repairs" && detail.repair.note && (
          <p className="detail-note">{detail.repair.note}</p>
        )}
        <div className="detail-rows">{detailRows(detail)}</div>
      </div>
    </>
  );
}
