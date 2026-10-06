import type { UserSettings } from "../core/game/UserSettings";

/** A rebound action: `value` is the key code, `key` what the player saw. */
export type UserKeybinds = Record<string, { value: string; key: string }>;

/**
 * The player's stored keybinds, cleaned up. Older saves hold a bare code per
 * action, or arrays where a string belongs; anything still unusable is
 * dropped so the action falls back to its default.
 */
export function readUserKeybinds(userSettings: UserSettings): UserKeybinds {
  const validated: UserKeybinds = {};
  for (const [action, entry] of Object.entries(
    userSettings.parsedUserKeybinds(),
  )) {
    if (typeof entry === "string") {
      validated[action] = { value: entry, key: entry };
    } else if (
      typeof entry === "object" &&
      entry !== null &&
      !Array.isArray(entry)
    ) {
      const rawValue = (entry as any).value ?? "Null";
      const value = Array.isArray(rawValue)
        ? rawValue.find((v) => typeof v === "string")
        : rawValue;

      const rawKey = (entry as any).key ?? value;
      const key = Array.isArray(rawKey)
        ? rawKey.find((v) => typeof v === "string")
        : rawKey;

      if (typeof value === "string" && typeof key === "string") {
        validated[action] = { value, key };
      }
    }
  }
  return validated;
}

// Pairs of actions that may share a physical modifier key.
const ALLOWED_SHARED_MODIFIERS: Array<{
  actions: [string, string];
  keyPrefix: string;
}> = [
  { actions: ["emojiMenuModifier", "altKey"], keyPrefix: "Alt" },
  { actions: ["boxSelectWarships", "shiftKey"], keyPrefix: "Shift" },
];

/**
 * Whether binding `action` to `value` would take a key another action already
 * uses. "Null" (unbound) never conflicts, and the modifier pairs above may
 * share their key.
 */
export function keybindConflicts(
  defaults: Record<string, string>,
  user: UserKeybinds,
  action: string,
  value: string,
): boolean {
  if (value === "Null") return false;
  const active = { ...defaults };
  for (const [k, v] of Object.entries(user)) {
    if (v.value === "Null") {
      delete active[k];
    } else {
      active[k] = v.value;
    }
  }

  const sharedModifier = ALLOWED_SHARED_MODIFIERS.some(
    ({ actions: [a1, a2], keyPrefix }) =>
      ((action === a1 && active[a2] === value) ||
        (action === a2 && active[a1] === value)) &&
      (value === `${keyPrefix}Left` || value === `${keyPrefix}Right`),
  );
  if (sharedModifier) return false;

  return Object.entries(active).some(([k, v]) => k !== action && v === value);
}
