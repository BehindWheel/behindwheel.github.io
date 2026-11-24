"use client";

type GpsNoticeProps = {
  error: string;
};

// Why the map has no fixes: an insecure origin, a denied permission, a dead
// GPS. The mode keeps running — the pill rides above the drive button and
// the first good fix clears it.
export default function GpsNotice({ error }: GpsNoticeProps) {
  return (
    <div className="drive-gps-error" role="status">
      {error}
    </div>
  );
}
