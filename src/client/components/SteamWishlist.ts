// Links to Territorium's Steam store page. UTM parameters let the Steamworks
// UTM analytics dashboard attribute a visit to the placement it came from
// (counted by Steam on its own site; nothing is measured on ours).
// See https://partner.steamgames.com/doc/marketing/utm_analytics

const STEAM_APP_ID = "5369890";

/** Store page for Territorium, tagged for the same UTM dashboard. */
export function steamStoreUrl(campaign: string): string {
  return steamUrl(`app/${STEAM_APP_ID}/Territorium/`, "link", campaign);
}

function steamUrl(path: string, medium: string, campaign: string): string {
  const params = new URLSearchParams({
    utm_source: "territorium",
    utm_medium: medium,
    utm_campaign: campaign,
  });
  return `https://store.steampowered.com/${path}?${params}`;
}
