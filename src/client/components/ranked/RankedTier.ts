import { html, svg } from "lit";
import { RankedTier } from "../../../core/ApiSchemas";
import { translateText } from "../../Utils";

// How each ranked tier looks wherever it is shown: the ranked hub, the
// ranked leaderboard and season badges on profiles.
const TIER_COLORS: Record<RankedTier, { fill: string; edge: string }> = {
  bronze: { fill: "#b8743a", edge: "#e2a76f" },
  silver: { fill: "#8d99a8", edge: "#dfe6ee" },
  gold: { fill: "#d9a520", edge: "#ffe28a" },
  platinum: { fill: "#2aa89a", edge: "#8ff0e2" },
  diamond: { fill: "#3b82f6", edge: "#b9dcff" },
  master: { fill: "#9333ea", edge: "#e2b8ff" },
  legend: { fill: "#e11d48", edge: "#ffd166" },
};

// Minimum rating of each tier, shown in the hub's tier list. Mirrors the
// API's TIERS; legend is the top five masters rather than a rating.
export const TIER_MIN_ELO: Record<Exclude<RankedTier, "legend">, number> = {
  bronze: 0,
  silver: 900,
  gold: 1050,
  platinum: 1200,
  diamond: 1350,
  master: 1500,
};

export const tierLabel = (tier: RankedTier) =>
  translateText(`ranked.tier_${tier}`);

// A shield in the tier's colours; legend gets a crown on top.
export function tierEmblem(tier: RankedTier, size = 40) {
  const { fill, edge } = TIER_COLORS[tier];
  return html`<svg
    width=${size}
    height=${size}
    viewBox="0 0 40 40"
    aria-hidden="true"
    class="shrink-0"
  >
    <path
      d="M20 3 L35 9 V20 C35 29 28 35 20 38 C12 35 5 29 5 20 V9 Z"
      fill=${fill}
      stroke=${edge}
      stroke-width="2"
    />
    <path
      d="M20 9 L29 13 V20 C29 26 25 30 20 32 C15 30 11 26 11 20 V13 Z"
      fill="none"
      stroke=${edge}
      stroke-opacity="0.45"
      stroke-width="1.5"
    />
    ${tier === "legend"
      ? svg`<path d="M12 17 L15 22 L20 15 L25 22 L28 17 L27 26 H13 Z" fill=${edge} />`
      : svg`<text x="20" y="25" text-anchor="middle" font-size="12" font-weight="700" fill=${edge}>${tierInitial(tier)}</text>`}
  </svg>`;
}

const tierInitial = (tier: RankedTier) => tierLabel(tier).charAt(0);

// "S1 · Diamond"-style chip for a finished season's badge.
export function seasonBadgeChip(season: number, tier: RankedTier) {
  const { fill, edge } = TIER_COLORS[tier];
  return html`<span
    class="inline-flex items-center gap-1.5 pl-1 pr-2.5 py-0.5 rounded-full text-xs font-bold text-white border"
    style="background: ${fill}33; border-color: ${edge}66"
    title=${translateText("ranked.season_badge_title", {
      season,
      tier: tierLabel(tier),
    })}
  >
    ${tierEmblem(tier, 18)}
    ${translateText("ranked.season_badge", { season, tier: tierLabel(tier) })}
  </span>`;
}
