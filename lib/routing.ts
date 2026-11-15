// Shareable detail links: the selected marker rides the URL as ?marker=<id>.
// Query format — GitHub Pages serves the static export without rewrites, so
// a deep path would land on 404.html before the app ever sees the id. No
// kind in the param: ids are unique across the CDN collections, the app
// resolves the kind itself by looking the id up in all three.
const MARKER_PARAM = "marker";

export function parseMarkerParam(search: string): string | null {
  return new URLSearchParams(search).get(MARKER_PARAM);
}

// The search string for the current selection's id, or "" when nothing is
// selected — the caller splices it onto the live URL.
export function markerSearch(id: string | null): string {
  return id ? `?${MARKER_PARAM}=${encodeURIComponent(id)}` : "";
}
