"use client";

import { STORE_URLS } from "@/lib/appBanner";

type AppBannerProps = {
  onClose: () => void;
};

// The official store badges — the same artwork the KMP repo's README ships.
// The platform's own store leads (a plain UA sniff: App Store for Apple
// devices, Google Play for everything else) and the other one trails — both
// stay, desktop visitors pick themselves. The banner renders after
// hydration only (the server snapshot says dismissed), so the sniff can't
// meet the server HTML.
const BADGES = [
  {
    href: STORE_URLS.appStore,
    src: "/icons/appstore-badge.png",
    alt: "Download on the App Store",
    label: "Скачать в App Store",
  },
  {
    href: STORE_URLS.googlePlay,
    src: "/icons/google-play-badge.png",
    alt: "Get it on Google Play",
    label: "Скачать в Google Play",
  },
] as const;

export default function AppBanner({ onClose }: AppBannerProps) {
  const appleFirst = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);
  const ordered = appleFirst ? BADGES : [BADGES[1], BADGES[0]];
  return (
    <div className="app-banner" role="region" aria-label="Мобильное приложение Grodno Roads">
      {/* a 32px static SVG — next/image's optimizer is overkill for it */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/logo.svg" alt="" width={32} height={32} />
      <div className="app-banner-text">
        <span className="app-banner-title">За рулем | Гродно и область</span>
        <span className="app-banner-subtitle">
          Актуальная информация о ситуации на дорогах
        </span>
      </div>
      <div className="app-banner-links">
        {ordered.map((badge) => (
          <a
            key={badge.href}
            className="app-banner-link"
            href={badge.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={badge.label}
          >
            {/* a 40px-tall static badge — next/image's optimizer is overkill */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={badge.src} alt={badge.alt} />
          </a>
        ))}
      </div>
      <button
        type="button"
        className="app-banner-close"
        aria-label="Скрыть баннер"
        onClick={onClose}
      >
        ✕
      </button>
    </div>
  );
}
