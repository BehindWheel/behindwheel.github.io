import Link from "next/link";

// The branded 404 — GitHub Pages serves this file for every unmatched URL,
// so the stock English "This page could not be found" is the site's face
// for any typo'd address. Next injects <meta name="robots" content="noindex">
// for it on its own.
export default function NotFound() {
  return (
    <main className="not-found">
      <h1 className="not-found-code">404</h1>
      <p className="not-found-text">Такой страницы нет — сайт состоит из одной карты.</p>
      <Link className="not-found-link" href="/">
        На карту
      </Link>
    </main>
  );
}
