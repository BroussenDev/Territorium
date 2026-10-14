import { beforeEach, describe, expect, it } from "vitest";
import {
  hideMenuChrome,
  menuChromeIsTornDown,
  restoreMenuChrome,
} from "../src/client/MenuChrome";

describe("menuChromeIsTornDown", () => {
  beforeEach(() => {
    restoreMenuChrome();
    document.body.className = "";
  });

  it("is false at the menu, so a pre-start leave restores nothing", () => {
    expect(menuChromeIsTornDown()).toBe(false);
  });

  it("is true as soon as the home page is put away", () => {
    hideMenuChrome();
    expect(menuChromeIsTornDown()).toBe(true);
  });

  it("stays true when put away twice (prestart, then join)", () => {
    hideMenuChrome();
    hideMenuChrome();
    expect(menuChromeIsTornDown()).toBe(true);
  });

  it("is false again once restored", () => {
    hideMenuChrome();
    restoreMenuChrome();
    expect(menuChromeIsTornDown()).toBe(false);
  });

  // The teardown happens at prestart, the in-game class only at join.
  it("does not consult the in-game class", () => {
    document.body.classList.add("in-game");
    expect(menuChromeIsTornDown()).toBe(false);
  });
});
