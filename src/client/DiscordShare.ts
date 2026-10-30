import { getApiBase } from "./ApiBase";
import { getAuthHeader } from "./Auth";

// "Announce my private games on Discord": the API keeps the choice, and the
// host's private lobby is reported to it (then its end), which posts the
// lobby with a join link in the community Discord for players who opted in.
// The lobby is also what the bot's /inviter command invites into.

// GET /users/@me/discord-share. null when signed out or on any error.
export async function getDiscordShare(): Promise<boolean | null> {
  try {
    const auth = await getAuthHeader();
    if (!auth) return null;
    const response = await fetch(`${getApiBase()}/users/@me/discord-share`, {
      headers: { Authorization: auth },
    });
    if (!response.ok) return null;
    const body = await response.json();
    return body?.enabled === true;
  } catch (e) {
    console.error("getDiscordShare: request failed", e);
    return null;
  }
}

// PUT /users/@me/discord-share. True when saved.
export async function setDiscordShare(enabled: boolean): Promise<boolean> {
  try {
    const response = await fetch(`${getApiBase()}/users/@me/discord-share`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: await getAuthHeader(),
      },
      body: JSON.stringify({ enabled }),
    });
    return response.ok;
  } catch (e) {
    console.error("setDiscordShare: request failed", e);
    return false;
  }
}

export interface PrivateGameInfo {
  map: string;
  mode: string;
}

// Settings change in bursts (sliders, map picker): one report once they
// settle.
const REPORT_DELAY_MS = 3000;
const pending = new Map<string, ReturnType<typeof setTimeout>>();
const reported = new Set<string>();

// The host's private lobby or its settings changed.
export function privateGameChanged(gameID: string, info: PrivateGameInfo) {
  const timer = pending.get(gameID);
  if (timer !== undefined) clearTimeout(timer);
  pending.set(
    gameID,
    setTimeout(() => {
      pending.delete(gameID);
      void reportPrivateGame(gameID, info);
    }, REPORT_DELAY_MS),
  );
}

async function reportPrivateGame(gameID: string, info: PrivateGameInfo) {
  try {
    const auth = await getAuthHeader();
    if (!auth) return;
    reported.add(gameID);
    await fetch(`${getApiBase()}/users/@me/private-game`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: auth },
      body: JSON.stringify({ gameID, map: info.map, mode: info.mode }),
    });
  } catch (e) {
    console.error("reportPrivateGame: request failed", e);
  }
}

// The lobby started or its host left: its announcement goes.
export function privateGameEnded(gameID: string) {
  const timer = pending.get(gameID);
  if (timer !== undefined) clearTimeout(timer);
  pending.delete(gameID);
  if (!reported.delete(gameID)) return;
  void (async () => {
    try {
      await fetch(
        `${getApiBase()}/users/@me/private-game/${encodeURIComponent(gameID)}`,
        { method: "DELETE", headers: { Authorization: await getAuthHeader() } },
      );
    } catch (e) {
      console.error("privateGameEnded: request failed", e);
    }
  })();
}
