import type { CdnData } from "@/lib/cdn";
import type { SelectionKind } from "@/lib/map/markers";

export type SearchHit = {
  kind: SelectionKind;
  id: string;
  label: string;
};

// Substring search over every object's display name (case-insensitive, no
// fuzz — 200-odd objects don't need an index). Cameras match on their name,
// repairs on the road. The kinds keep the data's order: stationary, then
// medium-speed sections, then repairs, then the traffic sensors, truncated
// to the panel's budget.
export function searchObjects(data: CdnData, query: string, limit = 8): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return [];
  }
  const hits: SearchHit[] = [];
  for (const camera of data.stationary) {
    if (camera.name.toLowerCase().includes(q)) {
      hits.push({ kind: "stationary", id: camera.id, label: camera.name });
    }
  }
  for (const camera of data.mediumSpeed) {
    if (camera.name.toLowerCase().includes(q)) {
      hits.push({ kind: "mediumSpeed", id: camera.id, label: camera.name });
    }
  }
  for (const repair of data.repairs) {
    if (repair.road.toLowerCase().includes(q)) {
      hits.push({ kind: "repairs", id: repair.id, label: repair.road });
    }
  }
  for (const sensor of data.traffic) {
    if (sensor.name.toLowerCase().includes(q)) {
      hits.push({ kind: "traffic", id: sensor.id, label: sensor.name });
    }
  }
  return hits.slice(0, limit);
}
