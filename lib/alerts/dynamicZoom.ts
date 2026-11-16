// The mobile app's DynamicZoomCalculator (kmp/features/guidance/domain/
// model/DynamicZoomCalculator.kt): faster means more context ahead — zoom
// eases from 16.1 down to 13 as speed approaches 140 km/h. Hysteresis in the
// middle band (15..25) holds the last zoom so GPS speed jitter around the
// threshold can't make the map breathe.

const MIN_DYNAMIC_ZOOM = 13.0;
const MAX_DYNAMIC_ZOOM = 16.1;
const MAX_SPEED_FOR_ZOOM = 140.0;
const MIN_SPEED_THRESHOLD = 25;
const RE_MIN_SPEED_THRESHOLD = 15;

export class DynamicZoom {
  private lastZoom = MAX_DYNAMIC_ZOOM;

  calculate(speedKmh: number): number {
    let zoom: number;
    if (speedKmh <= RE_MIN_SPEED_THRESHOLD) {
      zoom = MAX_DYNAMIC_ZOOM;
    } else if (speedKmh <= MIN_SPEED_THRESHOLD) {
      zoom = this.lastZoom;
    } else {
      const speedFraction = Math.min(Math.max(speedKmh / MAX_SPEED_FOR_ZOOM, 0), 1);
      zoom = MAX_DYNAMIC_ZOOM - (MAX_DYNAMIC_ZOOM - MIN_DYNAMIC_ZOOM) * speedFraction;
      zoom = Math.round(zoom * 10) / 10;
    }
    this.lastZoom = zoom;
    return zoom;
  }
}
