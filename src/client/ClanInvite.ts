import { ClientEnv } from "./ClientEnv";

// Clan invite links: https://<site>/clan/<TAG>/rejoindre (French) or
// /clan/<TAG>/join (every other language). Either form is accepted when
// opened, whatever the viewer's language.

const TAG_PATTERN = /^[A-Za-z0-9]{2,5}$/;
const INVITE_PATH = /^\/clan\/([A-Za-z0-9]{2,5})\/(?:rejoindre|join)\/?$/;
const PENDING_KEY = "territorium.pendingClanInvite";
const PENDING_TTL_MS = 24 * 60 * 60 * 1000;

/** The upper-cased clan tag of an invite path, or null for any other path. */
export function parseClanInvitePath(pathname: string): string | null {
  const m = INVITE_PATH.exec(pathname);
  return m ? m[1].toUpperCase() : null;
}

/** Shareable invite link for a clan; the path word follows the language. */
export function clanInviteUrl(tag: string, lang: string): string | null {
  if (!TAG_PATTERN.test(tag)) return null;
  const word = lang.toLowerCase().startsWith("fr") ? "rejoindre" : "join";
  return `${ClientEnv.shareOrigin()}/clan/${tag.toUpperCase()}/${word}`;
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * Keeps the clan of an opened invite link until the player has signed in (the
 * sign-in may happen in another tab, hence local storage and not session
 * storage), so they can join or apply right after.
 */
export function rememberPendingInvite(
  tag: string,
  now: number = Date.now(),
  storage: Storage | null = safeStorage(),
): void {
  if (!TAG_PATTERN.test(tag)) return;
  try {
    storage?.setItem(
      PENDING_KEY,
      JSON.stringify({ tag: tag.toUpperCase(), at: now }),
    );
  } catch {
    // Storage can be blocked; the invite then only works while signed in.
  }
}

interface PendingInvite {
  tag: string;
  // Set once the player turned out to be signed out: the join then happens by
  // itself right after they sign in.
  resume: boolean;
}

function readPending(
  now: number,
  storage: Storage | null,
): (PendingInvite & { at: number }) | null {
  try {
    const raw = storage?.getItem(PENDING_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Record<string, unknown>;
    if (
      typeof v.tag !== "string" ||
      typeof v.at !== "number" ||
      !TAG_PATTERN.test(v.tag) ||
      now - v.at > PENDING_TTL_MS ||
      v.at > now + 60_000
    ) {
      storage?.removeItem(PENDING_KEY);
      return null;
    }
    return { tag: v.tag, at: v.at, resume: v.resume === true };
  } catch {
    return null;
  }
}

/** The remembered invite's tag if it is still fresh; does not clear it. */
export function peekPendingInvite(
  now: number = Date.now(),
  storage: Storage | null = safeStorage(),
): string | null {
  return readPending(now, storage)?.tag ?? null;
}

/** Flags the remembered invite to be completed after the next sign-in. */
export function markPendingInviteForResume(
  now: number = Date.now(),
  storage: Storage | null = safeStorage(),
): void {
  const p = readPending(now, storage);
  if (!p || p.resume) return;
  try {
    storage?.setItem(PENDING_KEY, JSON.stringify({ ...p, resume: true }));
  } catch {
    // ignore
  }
}

/** The tag of an invite waiting for a sign-in to complete, if any. */
export function pendingInviteToResume(
  now: number = Date.now(),
  storage: Storage | null = safeStorage(),
): string | null {
  const p = readPending(now, storage);
  return p?.resume ? p.tag : null;
}

export function clearPendingInvite(
  storage: Storage | null = safeStorage(),
): void {
  try {
    storage?.removeItem(PENDING_KEY);
  } catch {
    // ignore
  }
}

export type InviteJoinResult =
  | { status: "joined" | "requested" }
  | { error: string; reason?: string };

/**
 * Called on every account refresh. Signed out: an opened invite is flagged so
 * it completes after the sign-in. Signed in with a flagged invite: the join
 * (or request, for a closed clan) is sent once and the invite is forgotten.
 */
export async function resumeInviteAfterSignIn(
  signedIn: boolean,
  join: (tag: string, via: "invite") => Promise<InviteJoinResult>,
  now: number = Date.now(),
  storage: Storage | null = safeStorage(),
): Promise<{ tag: string; result: InviteJoinResult } | null> {
  if (!signedIn) {
    markPendingInviteForResume(now, storage);
    return null;
  }
  const tag = pendingInviteToResume(now, storage);
  if (!tag) return null;
  clearPendingInvite(storage);
  return { tag, result: await join(tag, "invite") };
}
