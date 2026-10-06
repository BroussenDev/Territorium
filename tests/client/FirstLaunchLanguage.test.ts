import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/client/Utils", () => ({
  translateText: (key: string, params?: Record<string, string>) =>
    params?.key ? `${key}:${params.key}` : key,
  formatKeyForDisplay: (code: string) => code.replace(/^Key/, ""),
}));

const platform = vi.hoisted(() => ({ isTouch: false, isMac: false }));
vi.mock("../../src/client/Platform", () => ({ Platform: platform }));
vi.mock("../../src/client/sound/CuePlayer", () => ({
  audioControls: () => null,
}));

import {
  FIRST_LAUNCH_MASTER_VOLUME,
  FirstLaunchLanguage,
} from "../../src/client/components/FirstLaunchLanguage";
import { UserSettings } from "../../src/core/game/UserSettings";

if (!customElements.get("first-launch-language")) {
  customElements.define("first-launch-language", FirstLaunchLanguage);
}

const LANGUAGES = [
  { code: "en", native: "English", en: "English", svg: "uk_us_flag" },
  { code: "de", native: "Deutsch", en: "German", svg: "de" },
  { code: "fr", native: "Français", en: "French", svg: "fr" },
  { code: "ar", native: "العربية", en: "Arabic", svg: "sa" },
];

async function open(suggested: string | null) {
  const picker = document.createElement(
    "first-launch-language",
  ) as FirstLaunchLanguage;
  picker.languages = LANGUAGES;
  picker.suggested = suggested;
  document.body.appendChild(picker);
  await picker.updateComplete;
  return picker;
}

const codes = (picker: HTMLElement) =>
  [...picker.querySelectorAll<HTMLElement>("[data-lang]")].map(
    (b) => b.dataset.lang,
  );

const pressed = (picker: HTMLElement) =>
  picker
    .querySelector<HTMLElement>('[data-lang][aria-pressed="true"]')
    ?.getAttribute("data-lang");

async function proceed(picker: FirstLaunchLanguage) {
  picker
    .querySelector<HTMLButtonElement>("[data-first-launch-continue]")!
    .click();
  await picker.updateComplete;
}

beforeEach(() => {
  localStorage.clear();
  platform.isTouch = false;
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("first launch language step", () => {
  it("offers the suggested language, then English, then the rest by name", async () => {
    expect(codes(await open("fr"))).toEqual(["fr", "en", "ar", "de"]);
  });

  it("starts with the detected language picked, so Continue keeps it", async () => {
    const picker = await open("fr");
    expect(pressed(picker)).toBe("fr");
    const chosen: string[] = [];
    const listen = (e: Event) =>
      chosen.push((e as CustomEvent).detail.lang as string);
    window.addEventListener("language-selected", listen);
    try {
      await proceed(picker);
      expect(chosen).toEqual(["fr"]);
    } finally {
      window.removeEventListener("language-selected", listen);
    }
  });

  it("starts on English, with English first when nothing better is known", async () => {
    const picker = await open(null);
    expect(codes(picker)).toEqual(["en", "ar", "fr", "de"]);
    expect(pressed(picker)).toBe("en");
  });

  it("switches the game at once on a pick, and saves the choice on continue", async () => {
    const picker = await open("fr");
    const chosen: string[] = [];
    const listen = (e: Event) =>
      chosen.push((e as CustomEvent).detail.lang as string);
    window.addEventListener("language-selected", listen);
    try {
      picker.querySelector<HTMLButtonElement>('[data-lang="de"]')!.click();
      await picker.updateComplete;
      expect(chosen).toEqual(["de"]);
      await proceed(picker);
      expect(chosen).toEqual(["de", "de"]);
    } finally {
      window.removeEventListener("language-selected", listen);
    }
  });
});

describe("first launch sound and keys steps", () => {
  it("goes language, sound, keys, then closes on Play", async () => {
    const picker = await open(null);
    const closed = vi.fn();
    picker.addEventListener("close", closed);
    await proceed(picker);
    expect(picker.querySelector("[data-first-launch-audio]")).not.toBeNull();
    await proceed(picker);
    expect(picker.querySelector("[data-first-launch-keys]")).not.toBeNull();
    expect(closed).not.toHaveBeenCalled();
    expect(
      picker.querySelector("[data-first-launch-continue]")!.textContent,
    ).toContain("first_launch.play");
    await proceed(picker);
    expect(closed).toHaveBeenCalledOnce();
  });

  it("goes back a step without closing", async () => {
    const picker = await open(null);
    await proceed(picker);
    picker
      .querySelector<HTMLButtonElement>("[data-first-launch-back]")!
      .click();
    await picker.updateComplete;
    expect(codes(picker)).toContain("en");
  });

  it("sets the master volume to half, and the sliders change the volumes", async () => {
    const settings = new UserSettings();
    settings.setAudioVolume("master", 1);
    const picker = await open(null);
    expect(settings.audioVolume("master")).toBe(FIRST_LAUNCH_MASTER_VOLUME);
    await proceed(picker);
    const music = picker.querySelector("#first-launch-music")!;
    music.dispatchEvent(new CustomEvent("change", { detail: { value: 20 } }));
    expect(settings.audioVolume("music")).toBeCloseTo(0.2);
  });

  it("saves a new key and refuses one another action already uses", async () => {
    const picker = await open(null);
    await proceed(picker);
    await proceed(picker);
    const change = (action: string, value: string) =>
      picker
        .querySelector(`setting-keybind[action="${action}"]`)!
        .dispatchEvent(
          new CustomEvent("change", {
            detail: { action, value, key: value },
          }),
        );
    change("zoomIn", "KeyZ");
    await picker.updateComplete;
    expect(new UserSettings().parsedUserKeybinds()).toMatchObject({
      zoomIn: { value: "KeyZ" },
    });
    // KeyQ is zoomOut's default.
    change("centerCamera", "KeyQ");
    await picker.updateComplete;
    expect(picker.querySelector('[role="alert"]')?.textContent).toContain(
      "user_setting.keybind_conflict_error:Q",
    );
    expect(new UserSettings().parsedUserKeybinds()).not.toHaveProperty(
      "centerCamera",
    );
  });

  it("skips the keys on a touch device", async () => {
    platform.isTouch = true;
    const picker = await open(null);
    const closed = vi.fn();
    picker.addEventListener("close", closed);
    await proceed(picker);
    await proceed(picker);
    expect(closed).toHaveBeenCalledOnce();
  });
});
