import { afterEach, describe, expect, it, vi } from "vitest";
import { navigateTo, staysOnPage } from "../../src/client/PageTransition";

describe("staysOnPage", () => {
  const here = new URL(
    "https://territorium.gg/game/abc?host",
  ) as unknown as Location;

  it("is only a hash change on the same page", () => {
    expect(staysOnPage("#modal=store", here)).toBe(true);
    expect(staysOnPage("/game/abc?host#x", here)).toBe(true);
  });

  it("is a real navigation anywhere else", () => {
    expect(staysOnPage("/#modal=store&tab=packs", here)).toBe(false);
    expect(staysOnPage("/", here)).toBe(false);
    expect(staysOnPage("/game/abc?host", here)).toBe(false);
    expect(staysOnPage("https://other.example/game/abc?host#x", here)).toBe(
      false,
    );
  });
});

describe("navigateTo", () => {
  afterEach(() => {
    vi.useRealTimers();
    document.documentElement.classList.remove("desktop-shell", "page-leaving");
  });

  it("draws the curtain before leaving, in the desktop app", () => {
    vi.useFakeTimers();
    document.documentElement.classList.add("desktop-shell");
    const before = window.location.href;

    navigateTo("/somewhere-else");

    // The curtain is up, and the page is still here until it has covered it.
    expect(document.documentElement.classList.contains("page-leaving")).toBe(
      true,
    );
    expect(window.location.href).toBe(before);

    // A page brought back from the back/forward cache lifts it again.
    window.dispatchEvent(
      Object.assign(new Event("pageshow"), { persisted: true }),
    );
    expect(document.documentElement.classList.contains("page-leaving")).toBe(
      false,
    );
  });

  it("moves to a #hash at once, curtain or not", () => {
    document.documentElement.classList.add("desktop-shell");
    navigateTo("#hash-test");
    expect(window.location.hash).toBe("#hash-test");
    expect(document.documentElement.classList.contains("page-leaving")).toBe(
      false,
    );
  });

  it("leaves at once on the web", () => {
    navigateTo("#web-test");
    expect(window.location.hash).toBe("#web-test");
    expect(document.documentElement.classList.contains("page-leaving")).toBe(
      false,
    );
  });
});
