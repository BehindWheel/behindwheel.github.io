// The user's navigation arrow on the map, the web counterpart of the app's
// NavigationMarker: a DOM marker that turns to the bearing and glides between
// fixes. Like MarkerTiers, a plain class owning imperative map state.

import * as maplibregl from "maplibre-gl";
import { distanceBetween, type LatLng } from "./geo";

// The app's NavigationMarker animation: positions glide over 1400 ms, a jump
// past 300 m (a cold GPS fix, tunnel exit) snaps instead of flying.
const ANIMATION_MS = 1400;
const SNAP_DISTANCE = 300;

// The navigation arrow: a one-off stateful glyph, inline SVG in currentColor
// (the icons rule) — the inner element carries the bearing rotation so the
// anchor stays on the point.
const ARROW_SVG =
  '<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">' +
  '<path d="M12 2 L19 21 L12 17 L5 21 Z" fill="currentColor" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/>' +
  "</svg>";

export class UserArrow {
  private marker: maplibregl.Marker | null = null;
  private arrow: HTMLElement | null = null;
  // The glide: rAF interpolation between the previous fix and the new one,
  // restarted from the interpolated position when a fix lands mid-glide.
  private animation: { start: LatLng; end: LatLng; startedAt: number; frame: number } | null =
    null;

  constructor(private readonly map: maplibregl.Map) {}

  // Puts the arrow on a fix: created by the first one, then turned to the
  // bearing and glided to the point — snapped instead when the driver stands
  // still (nothing to glide) or the jump is far.
  update(latLng: LatLng, bearing: number, moving: boolean): void {
    this.ensureMarker(latLng);
    if (this.arrow) {
      this.arrow.style.transform = `rotate(${Math.round(bearing)}deg)`;
    }
    const current = this.animation
      ? lerp(this.animation.start, this.animation.end, this.progress())
      : latLng;
    this.stopAnimation();
    if (distanceBetween(current, latLng) > SNAP_DISTANCE || !moving) {
      this.marker?.setLngLat([latLng.lng, latLng.lat]);
      return;
    }
    this.animation = {
      start: current,
      end: latLng,
      startedAt: performance.now(),
      frame: requestAnimationFrame(this.tick),
    };
  }

  remove(): void {
    this.stopAnimation();
    this.marker?.remove();
    this.marker = null;
    this.arrow = null;
  }

  private ensureMarker(at: LatLng): void {
    if (this.marker) {
      return;
    }
    const element = document.createElement("div");
    element.className = "drive-marker";
    const arrow = document.createElement("span");
    arrow.className = "drive-arrow";
    arrow.innerHTML = ARROW_SVG;
    element.appendChild(arrow);
    this.arrow = arrow;
    this.marker = new maplibregl.Marker({ element, anchor: "center" })
      .setLngLat([at.lng, at.lat])
      .addTo(this.map);
  }

  private progress(): number {
    return this.animation
      ? Math.min((performance.now() - this.animation.startedAt) / ANIMATION_MS, 1)
      : 1;
  }

  private tick = (): void => {
    if (!this.animation || !this.marker) {
      return;
    }
    const t = this.progress();
    const at = lerp(this.animation.start, this.animation.end, t);
    this.marker.setLngLat([at.lng, at.lat]);
    if (t < 1) {
      this.animation.frame = requestAnimationFrame(this.tick);
    } else {
      this.animation = null;
    }
  };

  private stopAnimation(): void {
    if (this.animation) {
      cancelAnimationFrame(this.animation.frame);
      this.animation = null;
    }
  }
}

function lerp(from: LatLng, to: LatLng, t: number): LatLng {
  return {
    lat: from.lat + (to.lat - from.lat) * t,
    lng: from.lng + (to.lng - from.lng) * t,
  };
}
