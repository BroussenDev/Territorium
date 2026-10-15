import { afterEach, describe, expect, it, vi } from "vitest";
import { GameEnv } from "../../src/core/configuration/Config";
import {
  defaultJwtIssuer,
  fetchJwk,
  gameCreationRateFor,
  TURN_INTERVAL_MS,
  workerIndexFor,
} from "../../src/core/configuration/EnvShared";
import { ServerEnv } from "../../src/server/ServerEnv";

const KEY = { alg: "EdDSA", crv: "Ed25519", kty: "OKP", x: "abc" };

describe("EnvShared", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("names the token issuer after the domain", () => {
    expect(defaultJwtIssuer("territorium.gg")).toBe(
      "https://api.territorium.gg",
    );
    expect(defaultJwtIssuer("localhost")).toBe("http://localhost:8787");
  });

  // A server may run with only the API's address: the domain must not be
  // required then.
  it("takes the configured API address without reading the domain", () => {
    vi.stubEnv("API_URL", "https://example.test/api/");
    vi.stubEnv("DOMAIN", "");
    expect(ServerEnv.jwtIssuer()).toBe("https://example.test/api");
  });

  it("routes a game to the same worker every time", () => {
    const index = workerIndexFor("abcdefgh", 4);
    expect(index).toBeGreaterThanOrEqual(0);
    expect(index).toBeLessThan(4);
    expect(workerIndexFor("abcdefgh", 4)).toBe(index);
  });

  it("creates public lobbies faster in development", () => {
    expect(gameCreationRateFor(GameEnv.Dev)).toBeLessThan(
      gameCreationRateFor(GameEnv.Prod),
    );
    expect(TURN_INTERVAL_MS).toBe(100);
  });

  it("reads the signing key from the issuer's JWKS", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ keys: [KEY] })),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchJwk("https://api.test")).resolves.toEqual(KEY);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.test/.well-known/jwks.json",
    );
  });

  it("refuses a JWKS it cannot read", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ keys: [] }))),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(fetchJwk("https://api.test")).rejects.toThrow("Invalid JWKS");
  });
});
