import { JWK } from "jose";
import { z } from "zod";
import { GameID } from "../Schemas";
import { simpleHash } from "../Util";
import { GameEnv, JwksSchema } from "./Config";

// What ClientEnv (window.BOOTSTRAP_CONFIG) and ServerEnv (process.env)
// derive the same way from their own sources: one copy, so the browser and
// the server can never disagree on it.

/** Milliseconds between two turns of the game loop. */
export const TURN_INTERVAL_MS = 100;

/** How often a public lobby is created. */
export function gameCreationRateFor(env: GameEnv): number {
  return env === GameEnv.Dev ? 5 * 1000 : 2 * 60 * 1000;
}

/** The worker that owns a game: its id hashed over the worker count. */
export function workerIndexFor(gameID: GameID, numWorkers: number): number {
  return simpleHash(gameID) % numWorkers;
}

/**
 * Who signs the account tokens when no API address is configured:
 * api.<domain> (localhost's API in development). The configured address
 * wins, and the domain is only read without one: a server may run with
 * just the address.
 */
export function defaultJwtIssuer(audience: string): string {
  return audience === "localhost"
    ? "http://localhost:8787"
    : `https://api.${audience}`;
}

/** The token-signing public key, from the issuer's JWKS. */
export async function fetchJwk(issuer: string): Promise<JWK> {
  const jwksUrl = issuer + "/.well-known/jwks.json";
  console.log(`Fetching JWKS from ${jwksUrl}`);
  const response = await fetch(jwksUrl);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`JWKS fetch failed: ${response.status} ${body}`);
  }
  const result = JwksSchema.safeParse(await response.json());
  if (!result.success) {
    const error = z.prettifyError(result.error);
    console.error("Error parsing JWKS", error);
    throw new Error("Invalid JWKS");
  }
  return result.data.keys[0];
}
