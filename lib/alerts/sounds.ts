// The voice prompts and the player, the web counterpart of the mobile app's
// Sound.kt + SoundController.kt: the same phrase files the app plays, and the
// same sequencing — a camera warning is the camera-type phrase followed by
// the speed-limit phrase, an over-speed warning its own phrase. The phrases
// ship as static /audio/ files, so the drive mode speaks offline too.

import { FIVE_MINUTES, FIVE_SECONDS, PlayedAlertTracker } from "./engine";
import type { CameraType } from "./engine";

// The app's Sound.kt uris, one file per phrase under /audio/.
export const SOUND_FILES = {
  overSpeed: "/audio/sound_over_speed.mp3",
  stationaryCamera: "/audio/stationary_camera.mp3",
  mobileCamera: "/audio/mobile_camera.mp3",
  mediumSpeedCamera: "/audio/medium_speed_camera.mp3",
  limit: (speedLimit: number) => `/audio/limit_${speedLimit}.mp3`,
} as const;

function cameraSound(cameraType: CameraType): string {
  switch (cameraType) {
    case "stationary":
      return SOUND_FILES.stationaryCamera;
    case "mobile":
      return SOUND_FILES.mobileCamera;
    case "mediumSpeed":
      return SOUND_FILES.mediumSpeedCamera;
  }
}

function limitSound(speedLimit: number): string | null {
  return [40, 50, 60, 70, 80, 90, 100, 110, 120].includes(speedLimit)
    ? SOUND_FILES.limit(speedLimit)
    : null;
}

// The app's SharedSoundController: phrases enqueue in order and play one by
// one; the played-alert tracker decides whether a warning is allowed to
// sound at all. The over-speed id is fixed like the app's overSpeedId — the
// phrase may repeat every five seconds while the driver keeps speeding, and
// goes quiet the moment they slow down (a fresh alert object then re-warns).
export class AlertSoundController {
  private tracker = new PlayedAlertTracker();
  private overSpeedId = "over-speed";
  private queue: string[] = [];
  private playing = false;
  private audio: HTMLAudioElement | null = null;

  constructor(private readonly volume: () => number = () => 1) {}

  playCameraLimit(id: string, speedLimit: number, cameraType: CameraType): void {
    this.playIfAllowed(id, cameraSound(cameraType));
    const limit = limitSound(speedLimit);
    if (limit !== null) {
      this.playIfAllowed(`camera_${id}`, limit);
    }
    this.tracker.cleanup();
  }

  playOverSpeed(): void {
    this.playIfAllowed(this.overSpeedId, SOUND_FILES.overSpeed, FIVE_SECONDS);
    this.tracker.cleanup();
  }

  stop(): void {
    this.queue = [];
    if (this.audio) {
      this.audio.pause();
      this.audio = null;
    }
    this.playing = false;
  }

  private playIfAllowed(id: string, sound: string, expirationMs = FIVE_MINUTES): void {
    if (this.tracker.shouldPlay(id, expirationMs)) {
      if (this.enqueue(sound)) {
        this.tracker.record(id);
      }
    }
  }

  private enqueue(sound: string): boolean {
    this.queue.push(sound);
    this.playNext();
    return true;
  }

  // HTMLAudioElement sequenced through the ended event — one playing at a
  // time, the queue survives while the next phrase loads.
  private playNext(): void {
    if (this.playing) {
      return;
    }
    const next = this.queue.shift();
    if (!next) {
      return;
    }
    this.playing = true;
    const audio = new Audio(next);
    audio.volume = this.volume();
    this.audio = audio;
    audio.addEventListener("ended", () => {
      this.playing = false;
      this.audio = null;
      this.playNext();
    });
    // A failed phrase load skips itself; the queue keeps going — a missing
    // file must never wedge the drive mode's voice.
    audio.addEventListener("error", () => {
      this.playing = false;
      this.audio = null;
      this.playNext();
    });
    audio.play().catch(() => {
      // Autoplay rejection or a dead stream: drop the phrase, keep the queue.
      this.playing = false;
      this.audio = null;
    });
  }
}
