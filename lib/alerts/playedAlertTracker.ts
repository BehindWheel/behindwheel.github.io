// The app's PlayedAlertTracker: one alert id stays silent for five minutes
// once played (over-speed five seconds), so cruising past a camera warns
// once, not every GPS fix. History entries older than thirty minutes drop.

export const FIVE_SECONDS = 5_000;
export const FIVE_MINUTES = 5 * 60_000;
export const THIRTY_MINUTES = 30 * 60_000;

export class PlayedAlertTracker {
  private history = new Map<string, number>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  shouldPlay(id: string, expirationMs: number = FIVE_MINUTES): boolean {
    const lastPlayed = this.history.get(id);
    if (lastPlayed === undefined) {
      return true;
    }
    return this.now() - lastPlayed > expirationMs;
  }

  record(id: string): void {
    this.history.set(id, this.now());
  }

  // Takes an id back: a phrase that was recorded but never sounded (the
  // browser refused to play it) must be allowed again on the next fix.
  forget(id: string): void {
    this.history.delete(id);
  }

  cleanup(): void {
    const currentTime = this.now();
    for (const [id, playedAt] of this.history) {
      if (currentTime - playedAt > THIRTY_MINUTES) {
        this.history.delete(id);
      }
    }
  }
}
