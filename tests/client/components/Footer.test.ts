import version from "resources/version.txt?raw";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ClientEnv } from "../../../src/client/ClientEnv";
import { composeGameVersion } from "../../../src/client/GameVersion";
import { Footer } from "../../../src/client/components/Footer";

const SHA = "bf739f86c4e1d2a3b5c6d7e8f90123456789abcd";

// version.txt is a build-time placeholder in the repo, so derive the expected
// label from the same source the component reads rather than hardcoding it.
// These mount tests set no BOOTSTRAP_CONFIG, so composeGameVersion has no
// commit to fall back to and returns the file's value -- which keeps this
// the right expectation for the mounted component below. The choice itself is
// covered in tests/client/GameVersion.test.ts.
const gameVersion = `v${version.trim().replace(/^v/, "")}`;

describe("page-footer version line", () => {
  let footer: Footer;

  beforeEach(() => {
    if (!customElements.get("page-footer")) {
      customElements.define("page-footer", Footer);
    }
    ClientEnv.reset();
  });

  afterEach(() => {
    footer?.remove();
    window.openfrontDesktop = undefined;
    delete (window as { BOOTSTRAP_CONFIG?: unknown }).BOOTSTRAP_CONFIG;
    ClientEnv.reset();
  });

  async function mount(): Promise<Footer> {
    footer = document.createElement("page-footer") as Footer;
    document.body.appendChild(footer);
    await footer.updateComplete;
    return footer;
  }

  it("renders the game version on the web, with no Steam subtext", async () => {
    window.openfrontDesktop = undefined;
    await mount();

    const line = footer.querySelector(".footer-version");
    expect(line?.textContent?.trim()).toBe(gameVersion);
  });

  // The desktop app is a game, not a website: no footer bar. Its version and
  // legal links are in Settings > About; what stays is the licence notice.
  it("shows only the licence notice inside the desktop app", async () => {
    window.openfrontDesktop = {
      version: () => Promise.resolve("0.2.0"),
    };
    await mount();

    expect(footer.querySelector(".footer-version")).toBeNull();
    expect(
      footer.querySelector('[data-i18n="main.based_on_openfront"]'),
    ).not.toBeNull();
    // The licence's exact words, never translated.
    expect(
      footer.querySelector("[data-openfront-notice]")?.textContent,
    ).toContain("© OpenFront and Contributors");
    // Kept mounted, hidden: translateText() reads the language from it.
    expect(footer.querySelector("lang-selector")).not.toBeNull();
  });

  // End to end through the component: with a real BOOTSTRAP_CONFIG in the
  // page and the placeholder still in version.txt, the line must name the
  // commit rather than "vx.xx.xx". Expectation derived from the same helper
  // so committing a real version.txt does not turn this red.
  it("shows the commit rather than the placeholder on an untagged build", async () => {
    (window as { BOOTSTRAP_CONFIG?: unknown }).BOOTSTRAP_CONFIG = {
      gameEnv: "prod",
      numWorkers: 1,
      turnstileSiteKey: "1x00000000000000000000AA",
      jwtAudience: "openfront.io",
      instanceId: "test",
      gitCommit: SHA,
    };
    window.openfrontDesktop = undefined;
    await mount();

    const line = footer.querySelector(".footer-version");
    expect(line?.textContent?.trim()).toBe(composeGameVersion(version, SHA));
  });
});
