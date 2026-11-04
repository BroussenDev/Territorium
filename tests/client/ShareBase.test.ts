import { describe, expect, it, vi } from "vitest";
import {
  ClientEnv,
  deriveShareBase,
  deriveShareOrigin,
} from "../../src/client/ClientEnv";
import { playerProfileUrl } from "../../src/client/utilities/PlayerProfileUrl";

// These two answer "where should a link that LEAVES this client point?" — the
// lobby invite a host copies, the game link in a history row, the profile link
// a player sends a friend, the domain the magic-link email comes back to.
//
// On the web the answer is the document itself. The case they exist for is the
// desktop app's offline build, which the app serves from its own scheme
// (`game://localhost/offline.html` on Linux): a link built from window.location
// there resolves nowhere outside that one app.

/** What ClientEnv reads out of BOOTSTRAP_CONFIG, as the helpers take it. */
function bootstrap(siteOrigin?: string, jwtAudience = "openfront.io") {
  return () => ({ siteOrigin, jwtAudience });
}

/** A bootstrap that fails the test if the helper reads it at all. */
const forbidden = () => {
  throw new Error("BOOTSTRAP_CONFIG must not be required on the web path");
};

describe("deriveShareOrigin", () => {
  describe("web build: the document's own origin is shareable", () => {
    it("uses the document origin on https", () => {
      expect(
        deriveShareOrigin(bootstrap(), "https:", "https://openfront.io"),
      ).toBe("https://openfront.io");
    });

    it("keeps the port on local dev over http", () => {
      expect(
        deriveShareOrigin(bootstrap(), "http:", "http://localhost:9000"),
      ).toBe("http://localhost:9000");
    });

    it("never reads BOOTSTRAP_CONFIG on the web path", () => {
      // A plain web page — and a jsdom test rendering a copy button — must not
      // start requiring the bootstrap just to build a link to itself.
      expect(
        deriveShareOrigin(forbidden, "https:", "https://openfront.io"),
      ).toBe("https://openfront.io");
    });

    it("ignores an injected site host while the document is already on the web", () => {
      // A desktop build pointed at a dev server (OPENFRONT_DEV_URL) loads over
      // http; its own origin is shareable, so nothing should redirect it.
      expect(
        deriveShareOrigin(
          bootstrap("https://openfront.io"),
          "http:",
          "http://localhost:9000",
        ),
      ).toBe("http://localhost:9000");
    });
  });

  describe("desktop app: its own scheme is not a shareable origin", () => {
    it("targets the injected site host over TLS", () => {
      expect(
        deriveShareOrigin(
          bootstrap("https://openfront.io"),
          "game:",
          "game://localhost",
        ),
      ).toBe("https://openfront.io");
    });

    it("targets a staging deployment when that is what the build talks to", () => {
      expect(
        deriveShareOrigin(
          bootstrap("https://nightly.openfront.dev", "openfront.dev"),
          "game:",
          "game://localhost",
        ),
      ).toBe("https://nightly.openfront.dev");
    });

    it("never leaks the app's own origin", () => {
      expect(
        deriveShareOrigin(
          bootstrap("https://openfront.io"),
          "game:",
          "game://localhost",
        ),
      ).not.toContain("game:");
    });

    describe("a page that injects no site host falls back to the audience", () => {
      it("uses the audience host over TLS", () => {
        expect(
          deriveShareOrigin(
            bootstrap(undefined, "openfront.io"),
            "game:",
            "game://localhost",
          ),
        ).toBe("https://openfront.io");
      });

      it("keeps the localhost website on its dev port and scheme", () => {
        expect(
          deriveShareOrigin(
            bootstrap(undefined, "localhost"),
            "game:",
            "game://localhost",
          ),
        ).toBe("http://localhost:9000");
      });
    });
  });
});

describe("deriveShareBase", () => {
  it("keeps the current path on the web, so a link copied from /c/CODE stays there", () => {
    expect(
      deriveShareBase(bootstrap(), "https:", "https://openfront.io", "/c/abc"),
    ).toBe("https://openfront.io/c/abc");
  });

  it("drops the app's local offline.html path on desktop", () => {
    // A link copied there must not carry
    // game://localhost/offline.html#modal=profile&publicID=…
    const base = deriveShareBase(
      bootstrap("https://openfront.io"),
      "game:",
      "game://localhost",
      "/offline.html",
    );
    expect(base).toBe("https://openfront.io/");
    expect(base).not.toContain("index.html");
  });
});

describe("playerProfileUrl", () => {
  it("points at the site's profile page on the share origin, not window.location", () => {
    const shareOrigin = vi
      .spyOn(ClientEnv, "shareOrigin")
      .mockReturnValue("https://openfront.io");
    try {
      expect(playerProfileUrl("a+b")).toBe("https://openfront.io/joueur/a%2Bb");
    } finally {
      shareOrigin.mockRestore();
    }
  });
});
