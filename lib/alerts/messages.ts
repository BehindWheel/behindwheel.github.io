// The drive mode's user-facing strings, one place for the components, the
// session and the e2e suite to read from. The site carries no i18n infra —
// the whole UI is Russian inline — so these are constants, the same pattern
// as the region names in lib/cdn.ts.

// The alert cards' camera-kind title, keyed the way the engine types
// CameraType (the keys DriveOverlay's ALERT_ICONS reads too).
export const CAMERA_TITLES: Record<"stationary" | "mediumSpeed" | "mobile", string> = {
  stationary: "Стационарная камера",
  mediumSpeed: "Участок средней скорости",
  mobile: "Мобильная камера",
};

// The distance under the title: meters, no pluralization — the engine
// reports whole meters and "N м" reads right for 1..1000.
export const DISTANCE_UNIT = "м";

// The drive toggle's both faces.
export const DRIVE_START_LABEL = "Включить режим поездки";
export const DRIVE_STOP_LABEL = "Завершить режим поездки";

// The over-speed sign reads to a screen reader as a sentence.
export const OVER_SPEED_LABEL = (speedLimit: number): string =>
  `Превышение, ограничение ${speedLimit}`;

// Why the drive mode has no GPS fixes yet — the pill above the drive button.
export const GPS_ERROR_INSECURE =
  "Геолокация работает только по HTTPS — откройте сайт по защищённому адресу";
export const GPS_ERROR_DENIED =
  "Нет доступа к геолокации — разрешите её в настройках браузера";
export const GPS_ERROR_UNAVAILABLE =
  "GPS недоступен — сигнала нет, попробуйте у окна или на улице";
