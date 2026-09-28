import { ReactiveController, ReactiveControllerHost } from "lit";
import version from "resources/version.txt?raw";
import type { UserMeResponse } from "../../core/ApiSchemas";
import { getCosmeticsHash } from "../Cosmetics";
import { getGamesPlayed } from "../Utils";

const HELP_SEEN_KEY = "helpSeen";
const STORE_SEEN_HASH_KEY = "storeSeenHash";
const NEWS_SEEN_VERSION_KEY = "newsSeenVersion";
// Per account: the wearables the player had last time they looked at their
// inventory.
const INVENTORY_SEEN_KEY = "inventorySeenItems";

// What the inventory lists: owned skins, patterns, flags, crowns and effects.
// A wildcard grant ("pattern:*") is staff access, not an unlock.
function wearables(me: UserMeResponse): string[] {
  return (me.player.flares ?? []).filter(
    (f) => /^(pattern|skin|flag|crown|effect):/.test(f) && !f.endsWith("*"),
  );
}

function normalizedVersion(): string {
  const trimmed = version.trim();
  return trimmed.startsWith("v") ? trimmed : `v${trimmed}`;
}

/**
 * Shared dot state for the nav.
 *
 * One store, not one per component: the dots are prioritised against each
 * other (news > store > help), and the affordances now live in different
 * components — the bell and "?" in <nav-utility-icons>, the store in the nav
 * bars. With per-component state, dismissing the bell left the other
 * components' copy of `hasNewVersion` set, so the store dot stayed suppressed
 * until a reload.
 */
class NavNotificationsStore {
  private hosts = new Set<ReactiveControllerHost>();
  private loaded = false;

  private _helpSeen = false;
  private _hasNewCosmetics = false;
  private _hasNewVersion = false;
  private _hasNewItems = false;
  private _items: { key: string; items: string[] } | null = null;

  subscribe(host: ReactiveControllerHost): void {
    this.hosts.add(host);
    this.load();
  }

  unsubscribe(host: ReactiveControllerHost): void {
    this.hosts.delete(host);
  }

  private notify(): void {
    for (const host of this.hosts) host.requestUpdate();
  }

  // Read once per page load; every later subscriber reuses the result.
  private load(): void {
    if (this.loaded) return;
    this.loaded = true;

    this._helpSeen = localStorage.getItem(HELP_SEEN_KEY) === "true";

    document.addEventListener("userMeResponse", (event: Event) =>
      this.onUserMe((event as CustomEvent<UserMeResponse | false>).detail),
    );

    getCosmeticsHash()
      .then((hash: string | null) => {
        const seenHash = localStorage.getItem(STORE_SEEN_HASH_KEY);
        this._hasNewCosmetics = hash !== null && hash !== seenHash;
        this.notify();
      })
      .catch(() => {});

    const currentVersion = normalizedVersion();
    const seenVersion = localStorage.getItem(NEWS_SEEN_VERSION_KEY);
    this._hasNewVersion =
      seenVersion !== null && seenVersion !== currentVersion;
    if (seenVersion === null) {
      localStorage.setItem(NEWS_SEEN_VERSION_KEY, currentVersion);
    }
  }

  // A new unlock (a purchase, a reward, a clan pack) lights the inventory.
  // The first profile seen on this device only sets the baseline.
  private onUserMe(me: UserMeResponse | false): void {
    if (!me) {
      this._items = null;
      this._hasNewItems = false;
      this.notify();
      return;
    }
    const key = `${INVENTORY_SEEN_KEY}:${me.player.publicId}`;
    const items = wearables(me);
    this._items = { key, items };
    let seen: unknown = null;
    try {
      seen = JSON.parse(localStorage.getItem(key) ?? "null");
    } catch {
      // A corrupt entry is replaced below, like a missing one.
    }
    if (!Array.isArray(seen)) {
      localStorage.setItem(key, JSON.stringify(items));
      this._hasNewItems = false;
    } else {
      const known = new Set(seen);
      this._hasNewItems = items.some((i) => !known.has(i));
    }
    this.notify();
  }

  // Not ranked against the other dots: it is about the player's own items,
  // on its own button.
  showInventoryDot(): boolean {
    return this._hasNewItems;
  }

  onInventoryOpened = (): void => {
    if (this._items !== null) {
      localStorage.setItem(this._items.key, JSON.stringify(this._items.items));
    }
    if (!this._hasNewItems) return;
    this._hasNewItems = false;
    this.notify();
  };

  // Only show one dot at a time to prevent
  // overwhelming users. Priority: News > Store > Help.
  showNewsDot(): boolean {
    return this._hasNewVersion;
  }

  showStoreDot(): boolean {
    return this._hasNewCosmetics && !this.showNewsDot();
  }

  showHelpDot(): boolean {
    return (
      getGamesPlayed() < 10 &&
      !this._helpSeen &&
      !this.showNewsDot() &&
      !this.showStoreDot()
    );
  }

  onNewsClick = (): void => {
    this._hasNewVersion = false;
    localStorage.setItem(NEWS_SEEN_VERSION_KEY, normalizedVersion());
    this.notify();
  };

  onStoreClick = (): void => {
    this._hasNewCosmetics = false;
    getCosmeticsHash()
      .then((hash: string | null) => {
        if (hash !== null) {
          localStorage.setItem(STORE_SEEN_HASH_KEY, hash);
        }
      })
      .catch(() => {});
    this.notify();
  };

  onHelpClick = (): void => {
    localStorage.setItem(HELP_SEEN_KEY, "true");
    this._helpSeen = true;
    this.notify();
  };

  /** Test seam: drop all state so a fresh load re-reads localStorage. */
  reset(): void {
    this.hosts.clear();
    this.loaded = false;
    this._helpSeen = false;
    this._hasNewCosmetics = false;
    this._hasNewVersion = false;
    this._hasNewItems = false;
    this._items = null;
  }
}

export const navNotifications = new NavNotificationsStore();

/**
 * Host-facing view of {@link navNotifications}: keeps the component subscribed
 * for its lifetime and forwards the dot queries and click handlers.
 */
export class NavNotificationsController implements ReactiveController {
  private host: ReactiveControllerHost;

  constructor(host: ReactiveControllerHost) {
    this.host = host;
    host.addController(this);
  }

  hostConnected(): void {
    navNotifications.subscribe(this.host);
  }

  hostDisconnected(): void {
    navNotifications.unsubscribe(this.host);
  }

  showNewsDot(): boolean {
    return navNotifications.showNewsDot();
  }

  showStoreDot(): boolean {
    return navNotifications.showStoreDot();
  }

  showHelpDot(): boolean {
    return navNotifications.showHelpDot();
  }

  showInventoryDot(): boolean {
    return navNotifications.showInventoryDot();
  }

  onNewsClick = (): void => navNotifications.onNewsClick();
  onStoreClick = (): void => navNotifications.onStoreClick();
  onHelpClick = (): void => navNotifications.onHelpClick();
}
