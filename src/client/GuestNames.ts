// The name a player gets until they choose one: an adjective, a noun and a
// two-digit number ("ValiantFalcon42"), in the game's world of conquest,
// travel and the wild. Ordinary English that anyone can say, safe for every
// age (it is given TO a player, not chosen), and short enough that the
// longest pair still fits MAX_USERNAME_LENGTH with its number.
//
// Before these, the game handed out "Anon" + a word ("AnonEclipse5"):
// PlayerName.looksGenerated still recognises those, so they are replaced.

export const GUEST_ADJECTIVES: readonly string[] = [
  "Amber",
  "Ancient",
  "Azure",
  "Bold",
  "Brave",
  "Bright",
  "Calm",
  "Clever",
  "Crimson",
  "Daring",
  "Eastern",
  "Emerald",
  "Frosty",
  "Golden",
  "Grand",
  "Iron",
  "Keen",
  "Loyal",
  "Lucky",
  "Mighty",
  "Noble",
  "Northern",
  "Proud",
  "Quick",
  "Rapid",
  "Royal",
  "Silent",
  "Silver",
  "Southern",
  "Steady",
  "Stormy",
  "Sunny",
  "Swift",
  "True",
  "Valiant",
  "Western",
  "Wild",
  "Wise",
];

export const GUEST_NOUNS: readonly string[] = [
  "Admiral",
  "Badger",
  "Baron",
  "Bear",
  "Bison",
  "Captain",
  "Consul",
  "Duke",
  "Eagle",
  "Envoy",
  "Explorer",
  "Falcon",
  "Fox",
  "Hawk",
  "Herald",
  "Heron",
  "Lion",
  "Lynx",
  "Marshal",
  "Navigator",
  "Nomad",
  "Otter",
  "Owl",
  "Panther",
  "Pilot",
  "Pioneer",
  "Ranger",
  "Raven",
  "Rover",
  "Scout",
  "Sentinel",
  "Settler",
  "Stag",
  "Tiger",
  "Tribune",
  "Voyager",
  "Warden",
  "Wolf",
];

const GUEST_NAME = /^([A-Z][a-z]+)([A-Z][a-z]+)([1-9]\d)$/u;

/** A guest name from a random value in [0, guestNameCount()). */
export function guestName(slot: number): string {
  const s = Math.abs(Math.trunc(slot)) % guestNameCount();
  const adjective = GUEST_ADJECTIVES[s % GUEST_ADJECTIVES.length];
  const rest = Math.floor(s / GUEST_ADJECTIVES.length);
  const noun = GUEST_NOUNS[rest % GUEST_NOUNS.length];
  const number = 10 + Math.floor(rest / GUEST_NOUNS.length);
  return `${adjective}${noun}${number}`;
}

export function guestNameCount(): number {
  return GUEST_ADJECTIVES.length * GUEST_NOUNS.length * 90;
}

/** Whether a name has the exact shape guestName produces. */
export function isGuestName(name: string): boolean {
  const m = GUEST_NAME.exec(name);
  return (
    m !== null && GUEST_ADJECTIVES.includes(m[1]) && GUEST_NOUNS.includes(m[2])
  );
}
