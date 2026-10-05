import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/client/Utils", () => ({
  translateText: (key: string) => key,
}));

import { FirstLaunchLanguage } from "../../src/client/components/FirstLaunchLanguage";

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

afterEach(() => {
  document.body.innerHTML = "";
});

describe("first launch language picker", () => {
  it("offers the suggested language, then English, then the rest by name", async () => {
    expect(codes(await open("fr"))).toEqual(["fr", "en", "ar", "de"]);
  });

  it("starts on English, with English first when nothing better is known", async () => {
    const picker = await open(null);
    expect(codes(picker)).toEqual(["en", "ar", "fr", "de"]);
    expect(
      picker.querySelector('[data-lang="en"]')?.getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("switches the game at once on a pick, and saves the choice on continue", async () => {
    const picker = await open("fr");
    const chosen: string[] = [];
    const listen = (e: Event) =>
      chosen.push((e as CustomEvent).detail.lang as string);
    window.addEventListener("language-selected", listen);
    const closed = vi.fn();
    picker.addEventListener("close", closed);
    try {
      picker.querySelector<HTMLButtonElement>('[data-lang="de"]')!.click();
      await picker.updateComplete;
      expect(chosen).toEqual(["de"]);
      picker
        .querySelector<HTMLButtonElement>("[data-first-launch-continue]")!
        .click();
      expect(chosen).toEqual(["de", "de"]);
      expect(closed).toHaveBeenCalledOnce();
    } finally {
      window.removeEventListener("language-selected", listen);
    }
  });
});
