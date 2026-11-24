import { useCallback, useRef, useState, type RefObject } from "react";
import type { GeolocateControl, Map } from "maplibre-gl";
import type { CdnData } from "@/lib/cdn";
import { DriveSession, type DriveState } from "@/lib/alerts/driveSession";

type DriveModeDeps = {
  mapRef: RefObject<Map | null>;
  // The "where am I" control: the drive mode takes the position display away
  // from it (removeControl stops its watch and clears dot and circle) and
  // hands it back on exit.
  geolocateRef: RefObject<GeolocateControl | null>;
  dataRef: RefObject<CdnData | null>;
};

// The drive mode's React face: the session owns the GPS watch, the user
// arrow and the voice imperatively (like the marker tiers own the signs);
// React only mirrors its snapshot for the cards and the sign. The session
// ref survives re-renders, the state drives them.
export function useDriveMode({ mapRef, geolocateRef, dataRef }: DriveModeDeps) {
  const [active, setActive] = useState(false);
  const [state, setState] = useState<DriveState | null>(null);
  const sessionRef = useRef<DriveSession | null>(null);

  // Ends the session without touching the map's controls: the teardown path,
  // where the map is about to die anyway. The session holds a marker on that
  // map, so it must stop before the map is removed — or its next GPS fix
  // touches a dead container. Returns whether a session was running.
  const stop = useCallback((): boolean => {
    const session = sessionRef.current;
    if (!session) {
      return false;
    }
    session.stop();
    sessionRef.current = null;
    setActive(false);
    setState(null);
    return true;
  }, []);

  // The toggle needs both the map and the data — without either there is
  // nothing to navigate against, so the tap stays a no-op. A session lives
  // until stopped or until the map's teardown stops it.
  const toggle = useCallback(() => {
    const map = mapRef.current;
    const geolocate = geolocateRef.current;
    if (stop()) {
      // The "where am I" button returns with its dot and accuracy circle.
      if (map && geolocate) {
        map.addControl(geolocate, "bottom-right");
      }
      return;
    }
    const data = dataRef.current;
    if (!map || !data) {
      return;
    }
    // Drive owns the position display now — the control's removal also
    // stops any watch it ran, so the dot and circle never compete with the
    // drive arrow.
    if (geolocate) {
      map.removeControl(geolocate);
    }
    const session = new DriveSession(map, data, setState);
    sessionRef.current = session;
    session.start();
    setActive(true);
  }, [mapRef, geolocateRef, dataRef, stop]);

  return { active, state, toggle, stop };
}
