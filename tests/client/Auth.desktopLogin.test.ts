import { UnsecuredJWT } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  discordLogin,
  googleLogin,
  linkGoogle,
  logOut,
} from "../../src/client/Auth";
import { ClientEnv } from "../../src/client/ClientEnv";
import { showInGameAlert } from "../../src/client/InGameModal";

vi.mock("../../src/client/InGameModal", () => ({
  showInGameAlert: vi.fn(async () => undefined),
}));

// The three provider call sites in Auth.ts, in both directions (OPE-343).
//
// In the desktop app a provider login is not an OAuth redirect in the game's
// window: the app opens other sites in the player's browser, and signing in
// there would not reach the game. The call sites open the website's account
// settings in the browser instead, where the player signs in and links their
// Steam account, and must never navigate to `/auth/login/*`. On the web
// nothing changes, and that half is pinned here too so the desktop branch
// cannot leak.

// serverHost is what a server-rendered page carries: the game server AND
// website host, which is the bare audience only in production and a branch
// subdomain on dev/staging -- see resolveServerOrigin in ClientEnv.ts.
function setBootstrapConfig(
  overrides: { jwtAudience?: string; serverHost?: string } = {},
) {
  (window as any).BOOTSTRAP_CONFIG = {
    gameEnv: "prod",
    numWorkers: 1,
    turnstileSiteKey: "x",
    jwtAudience: "openfront.dev",
    instanceId: "d",
    gitCommit: "t",
    ...overrides,
  };
  ClientEnv.reset();
}

function sessionJwt(): string {
  return new UnsecuredJWT({
    jti: "some-id",
    sub: "AAAAAAAAAAAAAAAAAAAAAA",
    iat: Math.floor(Date.now() / 1000),
    iss: "https://api.openfront.dev",
    aud: "openfront.dev",
    exp: Math.floor(Date.now() / 1000) + 3600,
  }).encode();
}

// jsdom's location is not assignable (a cross-document navigation is "not
// implemented"), and the whole point here is to observe what href gets set
// to -- so replace the object, the same way CreatorCodePanel.test.ts and
// UsernameBareClaim.test.ts do.
const realLocationDescriptor = Object.getOwnPropertyDescriptor(
  window,
  "location",
)!;

// The desktop app's offline build on Linux, the one page whose own origin is
// no website: what is opened in the browser must come from the site instead.
const DESKTOP_HREF = "game://localhost/offline.html#modal=account";
const WEB_HREF = "https://openfront.dev/#modal=account";

function stubLocation(href: string): { href: string } {
  const stub = { href, hash: new URL(href).hash };
  Object.defineProperty(window, "location", {
    configurable: true,
    value: stub,
  });
  return stub;
}

beforeEach(async () => {
  setBootstrapConfig();
  // logOut() POSTs /auth/logout; keep the harness off the network.
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
  await logOut();
  vi.restoreAllMocks();
  // restoreAllMocks restores spies; it does not clear a module-mock vi.fn.
  vi.mocked(showInGameAlert).mockClear();
});

afterEach(() => {
  Object.defineProperty(window, "location", realLocationDescriptor);
  delete (window as { openfrontDesktop?: unknown }).openfrontDesktop;
});

describe("provider login in the desktop app", () => {
  let location: { href: string };
  let fetchMock: ReturnType<typeof vi.spyOn>;
  let openMock: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    (window as unknown as { openfrontDesktop: unknown }).openfrontDesktop = {};
    location = stubLocation(DESKTOP_HREF);
    fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("must not be called"));
    openMock = vi
      .spyOn(window, "open")
      .mockReturnValue(null as unknown as Window);
  });

  it.each([
    ["discordLogin", discordLogin],
    ["googleLogin", googleLogin],
  ])(
    "%s opens the website's account settings and never redirects",
    (_, login) => {
      setBootstrapConfig({
        serverHost: "territorium.gg",
        jwtAudience: "territorium.gg",
      });

      login();

      expect(openMock).toHaveBeenCalledTimes(1);
      expect(openMock.mock.calls[0][0]).toBe(
        "https://territorium.gg/#modal=account-settings",
      );
      expect(location.href).toBe(DESKTOP_HREF);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  // Linking Google goes to the same place, where the real OAuth flow runs --
  // and, crucially, never to /auth/link/google from the game's window.
  it("linkGoogle opens the website's account settings in the browser", async () => {
    setBootstrapConfig({
      serverHost: "openfront.io",
      jwtAudience: "openfront.io",
    });

    await expect(linkGoogle()).resolves.toBe(true);

    expect(openMock).toHaveBeenCalledTimes(1);
    expect(openMock.mock.calls[0][0]).toBe(
      "https://openfront.io/#modal=account-settings",
    );
    expect(location.href).toBe(DESKTOP_HREF);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // The website host is the injected serverHost, not the JWT audience: on a
  // dev/staging build the audience is the apex (openfront.dev), where nothing
  // is deployed, and the site lives on a branch subdomain.
  it("linkGoogle targets the injected branch host, not the audience apex", async () => {
    setBootstrapConfig({ serverHost: "my-feature.openfront.dev" });

    await expect(linkGoogle()).resolves.toBe(true);

    expect(openMock.mock.calls[0][0]).toBe(
      "https://my-feature.openfront.dev/#modal=account-settings",
    );
  });

  // The API's server list (multi-server v2) picks a GAME server, and once
  // it is applied serverHttpBase() answers with that deployment host --
  // falk2-b.openfront.io, which serves no website. The account-settings
  // link reads the site the app was launched against, not the game
  // server, so it must be unmoved by the list.
  it("linkGoogle still targets the website after a server list is applied", async () => {
    setBootstrapConfig({
      serverHost: "openfront.io",
      jwtAudience: "openfront.io",
    });
    ClientEnv.applyServerList(
      {
        latest: "bfd5563a",
        servers: {
          d: {
            host: "falk2-b.openfront.io",
            numWorkers: 16,
            version: "bfd5563a",
            state: "open" as const,
          },
        },
      },
      "d",
    );
    expect(ClientEnv.serverHttpBase()).toBe("https://falk2-b.openfront.io");

    await expect(linkGoogle()).resolves.toBe(true);

    expect(openMock.mock.calls[0][0]).toBe(
      "https://openfront.io/#modal=account-settings",
    );
  });

  // A page that injects no serverHost falls back to the audience-derived
  // origin, keeping the localhost:9000 dev case.
  it("linkGoogle falls back to the audience origin without a serverHost", async () => {
    setBootstrapConfig({ jwtAudience: "localhost" });

    await expect(linkGoogle()).resolves.toBe(true);

    expect(openMock.mock.calls[0][0]).toBe(
      "http://localhost:9000/#modal=account-settings",
    );
  });
});

describe("provider login on the web", () => {
  let location: { href: string };

  beforeEach(() => {
    location = stubLocation(WEB_HREF);
  });

  it("discordLogin navigates to the API's Discord login with the page as redirect_uri", () => {
    discordLogin();

    expect(location.href).toBe(
      `https://api.openfront.dev/auth/login/discord?redirect_uri=${encodeURIComponent(WEB_HREF)}`,
    );
  });

  it("googleLogin navigates to the API's Google login with the page as redirect_uri", () => {
    googleLogin();

    expect(location.href).toBe(
      `https://api.openfront.dev/auth/login/google?redirect_uri=${encodeURIComponent(WEB_HREF)}`,
    );
  });

  it("linkGoogle fetches the authorize URL with the Bearer token and navigates to it", async () => {
    const jwt = sessionJwt();
    const authorizeUrl = "https://accounts.google.com/o/oauth2/auth?state=x";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input, init) => {
        const url = String(input);
        if (url.endsWith("/auth/refresh")) {
          return new Response(JSON.stringify({ jwt, expiresIn: 900 }), {
            status: 200,
          });
        }
        if (url.startsWith("https://api.openfront.dev/auth/link/google")) {
          expect(new Headers(init?.headers).get("Authorization")).toBe(
            `Bearer ${jwt}`,
          );
          return new Response(JSON.stringify({ url: authorizeUrl }), {
            status: 200,
          });
        }
        throw new Error(`unexpected fetch ${url}`);
      });
    const openMock = vi
      .spyOn(window, "open")
      .mockReturnValue(null as unknown as Window);

    await expect(linkGoogle()).resolves.toBe(true);

    const linkCall = fetchMock.mock.calls.find(([input]) =>
      String(input).includes("/auth/link/google"),
    );
    expect(linkCall).toBeDefined();
    expect(String(linkCall![0])).toBe(
      `https://api.openfront.dev/auth/link/google?redirect_uri=${encodeURIComponent(WEB_HREF)}`,
    );
    expect(location.href).toBe(authorizeUrl);
    expect(openMock).not.toHaveBeenCalled();
  });

  it("linkGoogle returns false without navigating when logged out", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));

    await expect(linkGoogle()).resolves.toBe(false);

    expect(location.href).toBe(WEB_HREF);
  });
});
