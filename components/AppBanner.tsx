"use client";

import { STORE_URLS } from "@/lib/appBanner";

type AppBannerProps = {
  onClose: () => void;
};

// The official store badges — the same artwork the KMP repo's README ships —
// both on every platform; the user picks their store themselves.
export default function AppBanner({ onClose }: AppBannerProps) {
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
        <a
          className="app-banner-link"
          href={STORE_URLS.appStore}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Скачать в App Store"
        >
          {/* a 40px-tall static badge — next/image's optimizer is overkill */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/appstore-badge.png" alt="Download on the App Store" />
        </a>
        <a
          className="app-banner-link"
          href={STORE_URLS.googlePlay}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Скачать в Google Play"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/google-play-badge.png" alt="Get it on Google Play" />
        </a>
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
