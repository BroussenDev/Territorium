// Leaving the page (back to the menu after a game, into another lobby,
// reloading) in the desktop app: the curtain (index.html) fades in over the
// page first, then the next page opens behind it and fades it out once
// loaded. A scene change, as in a game, instead of the page cutting to a
// blank screen while the next one loads. On the web the page is left at once.

const CURTAIN_MS = 220;
// Lifted again if the page is still here by then: the navigation went
// elsewhere (a link the app opens in the browser) or was cancelled.
const CURTAIN_GIVE_UP_MS = 6000;

let leaving = false;

function curtainShown(): boolean {
  const root = document.documentElement;
  if (!root.classList.contains("desktop-shell")) return false;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    return false;
  }
  return true;
}

function liftCurtain(): void {
  leaving = false;
  document.documentElement.classList.remove("page-leaving");
}

function leave(go: () => void): void {
  if (!curtainShown()) {
    go();
    return;
  }
  if (leaving) return;
  leaving = true;
  document.documentElement.classList.add("page-leaving");
  window.setTimeout(() => {
    go();
    window.setTimeout(liftCurtain, CURTAIN_GIVE_UP_MS);
  }, CURTAIN_MS);
}

/** Whether going to `url` only moves within this page (a new #hash). */
export function staysOnPage(url: string, here: Location = window.location) {
  let next: URL;
  try {
    next = new URL(url, here.href);
  } catch {
    return false;
  }
  return (
    next.origin === here.origin &&
    next.pathname === here.pathname &&
    next.search === here.search &&
    next.hash !== ""
  );
}

/** Opens `url` in place of the page, as `location.href = url` does. */
export function navigateTo(url: string): void {
  if (staysOnPage(url)) {
    window.location.href = url;
    return;
  }
  leave(() => {
    window.location.href = url;
  });
}

/** Replaces the page with `url`, as `location.replace(url)` does. */
export function replaceWith(url: string): void {
  if (staysOnPage(url)) {
    window.location.replace(url);
    return;
  }
  leave(() => {
    window.location.replace(url);
  });
}

/** Reloads the page. */
export function reloadPage(): void {
  leave(() => {
    window.location.reload();
  });
}

// A page restored from the back/forward cache comes back with the curtain
// still drawn; lift it.
window.addEventListener("pageshow", (e) => {
  if (e.persisted) liftCurtain();
});
