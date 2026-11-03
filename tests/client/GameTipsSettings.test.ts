import { beforeEach, describe, expect, it, vi } from "vitest";

// UserSettings keeps a static cache, so each test loads a fresh module.
async function loadSettings() {
  vi.resetModules();
  const mod = await import("../../src/core/game/UserSettings");
  return new mod.UserSettings();
}

describe("game tips setting", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("is on for a player with no games yet", async () => {
    const settings = await loadSettings();
    expect(settings.gameTips()).toBe(true);
  });

  it("is on below ten games", async () => {
    localStorage.setItem("gamesPlayed", "9");
    const settings = await loadSettings();
    expect(settings.gameTips()).toBe(true);
  });

  it("is off from ten games on, until the player chooses", async () => {
    localStorage.setItem("gamesPlayed", "10");
    const settings = await loadSettings();
    expect(settings.gameTips()).toBe(false);
  });

  it("keeps an explicit choice over the games count", async () => {
    localStorage.setItem("gamesPlayed", "0");
    const settings = await loadSettings();
    settings.setGameTips(false);
    expect(settings.gameTips()).toBe(false);

    localStorage.setItem("gamesPlayed", "50");
    const reloaded = await loadSettings();
    expect(reloaded.gameTips()).toBe(false);
  });

  it("toggles and stores the new value", async () => {
    localStorage.setItem("gamesPlayed", "0");
    const settings = await loadSettings();
    settings.toggleGameTips();
    expect(settings.gameTips()).toBe(false);
    settings.toggleGameTips();
    expect(settings.gameTips()).toBe(true);
  });
});
