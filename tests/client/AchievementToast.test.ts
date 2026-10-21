import { afterEach, describe, expect, it, vi } from "vitest";
import {
  iconUrl,
  showAchievementToast,
} from "../../src/client/components/AchievementToast";

afterEach(() => {
  document.body.innerHTML = "";
  vi.useRealTimers();
});

describe("AchievementToast", () => {
  it("refuses an icon that is not 64x64 RGBA", () => {
    expect(iconUrl(null)).toBeNull();
    expect(iconUrl(btoa("abc"))).toBeNull();
  });

  it("shows the unlocked achievement with its Steam name and description", async () => {
    showAchievementToast({
      ok: true,
      unlocked: true,
      name: "First Win",
      description: "Win one game",
    });
    const el = document.querySelector("achievement-toast") as HTMLElement & {
      updateComplete: Promise<unknown>;
    };
    await el.updateComplete;
    expect(el.textContent).toContain("First Win");
    expect(el.textContent).toContain("Win one game");
  });

  it("shows them one after another", async () => {
    vi.useFakeTimers();
    showAchievementToast({ ok: true, unlocked: true, name: "One" });
    showAchievementToast({ ok: true, unlocked: true, name: "Two" });
    const el = document.querySelector("achievement-toast") as HTMLElement & {
      updateComplete: Promise<unknown>;
    };
    await el.updateComplete;
    expect(el.textContent).toContain("One");
    expect(el.textContent).not.toContain("Two");
    vi.advanceTimersByTime(6000);
    await el.updateComplete;
    expect(el.textContent).toContain("Two");
  });
});
