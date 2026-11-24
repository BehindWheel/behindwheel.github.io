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

// The limits the app ships a phrase for (Sound.kt's SpeedLimit40..120);
// anything else stays silent — a camera without a phrase can't warn.
const SUPPORTED_LIMITS = [40, 50, 60, 70, 80, 90, 100, 110, 120];

function limitSound(speedLimit: number): string | null {
  return SUPPORTED_LIMITS.includes(speedLimit)
    ? SOUND_FILES.limit(speedLimit)
    : null;
}

// A near-empty WAV: played from the drive button's tap it unlocks the audio
// element for the GPS-driven phrases that follow (see unlock()).
const SILENT_WAV = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

type Phrase = { id: string; sound: string };

// The app's SharedSoundController: phrases enqueue in order and play one by
// one; the played-alert tracker decides whether a warning is allowed to
// sound at all. The over-speed id is fixed like the app's overSpeedId — the
// tracker keeps the phrase from repeating within five seconds, so a driver
// hovering around the limit isn't nagged; the caller decides when a new
// over-speed state deserves the phrase.
export class AlertSoundController {
  private tracker = new PlayedAlertTracker();
  private overSpeedId = "over-speed";
  private queue: Phrase[] = [];
  private playing = false;
  // One element for the whole session: browsers (iOS Safari first) allow
  // script-started playback only on an element a user gesture has already
  // played, and the phrases start from GPS callbacks, never from a tap.
  private audio: HTMLAudioElement | null = null;
  // Bumped by stop(): a late event or rejection from a phrase of the
  // previous run must not touch the queue of the next one.
  private generation = 0;

  constructor(private readonly volume: () => number = () => 1) {}

  // Call from the user gesture that starts the drive: plays the silent clip
  // so the element is unlocked before the first GPS-driven phrase.
  unlock(): void {
    const audio = this.element();
    audio.src = SILENT_WAV;
    audio.play().catch(() => {
      // Nothing to unlock on a browser that refuses even this; the phrases
      // handle their own rejection (and un-record themselves, see playNext).
    });
  }

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
    this.generation += 1;
    this.queue = [];
    if (this.audio) {
      this.audio.pause();
      this.audio.onended = null;
      this.audio.onerror = null;
      this.audio = null;
    }
    this.playing = false;
  }

  private element(): HTMLAudioElement {
    this.audio ??= new Audio();
    return this.audio;
  }

  // The id is recorded when the phrase is queued, not when it finishes: GPS
  // fixes arrive every second while a phrase takes several, and the same
  // alert must not queue twice meanwhile. A phrase the browser then refuses
  // to play gives its id back (playNext), so it is not silenced for minutes.
  private playIfAllowed(id: string, sound: string, expirationMs = FIVE_MINUTES): void {
    if (this.tracker.shouldPlay(id, expirationMs)) {
      this.tracker.record(id);
      this.queue.push({ id, sound });
      this.playNext();
    }
  }

  // One element sequenced through ended/error — one phrase playing at a
  // time, the queue survives while the next one loads.
  private playNext(): void {
    if (this.playing) {
      return;
    }
    const next = this.queue.shift();
    if (!next) {
      return;
    }
    this.playing = true;
    const generation = this.generation;
    const audio = this.element();
    let finished = false;
    const finish = (refused: boolean) => {
      if (finished || generation !== this.generation) {
        return;
      }
      finished = true;
      audio.onended = null;
      audio.onerror = null;
      if (refused) {
        this.tracker.forget(next.id);
      }
      this.playing = false;
      this.playNext();
    };
    audio.onended = () => finish(false);
    // A failed phrase load skips itself and the queue keeps going — a
    // missing file must never wedge the drive mode's voice (nor be retried
    // every second: the id stays recorded).
    audio.onerror = () => finish(false);
    audio.src = next.sound;
    audio.volume = this.volume();
    audio.play().catch((error: unknown) => {
      // NotAllowedError is autoplay policy: the phrase never sounded, so it
      // gets its id back and the next fix may try again. Anything else (an
      // interrupted load, a dead stream) just drops the phrase. Either way
      // the rest of the queue goes on.
      finish(error instanceof DOMException && error.name === "NotAllowedError");
    });
  }
}
