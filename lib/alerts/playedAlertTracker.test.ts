import { describe, expect, it } from "vitest";
import { FIVE_MINUTES, FIVE_SECONDS, PlayedAlertTracker } from "./playedAlertTracker";

describe("PlayedAlertTracker", () => {
  it("allows the first play, blocks inside the window, re-allows after", () => {
    let now = 0;
    const tracker = new PlayedAlertTracker(() => now);
    expect(tracker.shouldPlay("a")).toBe(true);
    tracker.record("a");
    expect(tracker.shouldPlay("a")).toBe(false);
    now = FIVE_MINUTES;
    expect(tracker.shouldPlay("a")).toBe(false);
    now = FIVE_MINUTES + 1;
    expect(tracker.shouldPlay("a")).toBe(true);
  });

  it("honors a custom window for the over-speed repeat", () => {
    let now = 0;
    const tracker = new PlayedAlertTracker(() => now);
    tracker.record("over-speed");
    expect(tracker.shouldPlay("over-speed", FIVE_SECONDS)).toBe(false);
    now = FIVE_SECONDS + 1;
    expect(tracker.shouldPlay("over-speed", FIVE_SECONDS)).toBe(true);
  });

  it("drops history older than the cleanup horizon", () => {
    let now = 0;
    const tracker = new PlayedAlertTracker(() => now);
    tracker.record("old");
    now = 60 * 60_000;
    tracker.cleanup();
    expect(tracker.shouldPlay("old")).toBe(true);
  });

  it("forget() gives an id back at once, inside the window", () => {
    const tracker = new PlayedAlertTracker(() => 0);
    tracker.record("refused");
    expect(tracker.shouldPlay("refused")).toBe(false);
    tracker.forget("refused");
    expect(tracker.shouldPlay("refused")).toBe(true);
  });
});
