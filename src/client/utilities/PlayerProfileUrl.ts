import { ClientEnv } from "../ClientEnv";

/**
 * Build a shareable profile URL for a publicId.
 *
 * Its own module so callers that only need the link — the nav profile menu's
 * copy action, say — don't pull in the whole profile modal.
 *
 * The link is the site's own profile page (/joueur/<id>), which the API renders
 * with a preview card for chat and social embeds; opened in the app it routes to
 * the profile modal. The origin comes from ClientEnv.shareOrigin(), not
 * window.location, because this link is copied to the clipboard to be sent to
 * someone else: the desktop app's offline build lives on a URL only that app can
 * resolve.
 */
export function playerProfileUrl(publicId: string): string {
  return `${ClientEnv.shareOrigin()}/joueur/${encodeURIComponent(publicId)}`;
}
