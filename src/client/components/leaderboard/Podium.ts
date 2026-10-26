import { html, nothing, svg, TemplateResult } from "lit";
import { translateText } from "../../Utils";

/** One of the three places on a board's podium. */
export interface PodiumPlace {
  key: string;
  name: TemplateResult;
  /** The board's figure for them (Elo, points, wins…), already formatted. */
  value: string;
  /** What the figure is ("Elo", "points"…), under it. */
  unit: string;
}

const METALS = [
  { top: "#f6d36b", bottom: "#a8741a", text: "text-amber-200", plinth: "h-24" },
  { top: "#e3e9ec", bottom: "#7f8c93", text: "text-slate-200", plinth: "h-16" },
  {
    top: "#e7a165",
    bottom: "#86491d",
    text: "text-orange-200",
    plinth: "h-11",
  },
] as const;

// The order on screen: second, first, third.
const ORDER = [1, 0, 2] as const;

/**
 * The top three of a board on a podium, above its table: first in the
 * middle and highest, under a crown. Fewer than three places leave the
 * empty steps bare.
 */
export function podium(
  board: string,
  places: PodiumPlace[],
): TemplateResult | typeof nothing {
  if (places.length === 0) return nothing;
  return html`
    <div
      class="relative px-4 pt-5 border-b border-white/5 bg-[radial-gradient(ellipse_at_50%_100%,rgba(16,185,129,0.14),transparent_70%)]"
      role="list"
      aria-label=${translateText("leaderboard_modal.podium")}
    >
      <div class="mx-auto grid max-w-xl grid-cols-3 items-end gap-2 sm:gap-4">
        ${ORDER.map((i) => step(board, places[i], i))}
      </div>
    </div>
  `;
}

function step(board: string, place: PodiumPlace | undefined, index: number) {
  const metal = METALS[index];
  // Unique per board: every board's podium is in the page at once, and a
  // gradient inside a hidden one would not paint.
  const id = `podium-${board}-${index}`;
  return html`
    <div class="flex min-w-0 flex-col items-center" role="listitem">
      ${place
        ? html`
            ${index === 0 ? crown() : nothing} ${medal(index + 1, id)}
            <div
              class="mt-1.5 flex max-w-full min-w-0 flex-col items-center px-1 text-center"
            >
              <span
                class="block max-w-full truncate text-sm font-bold text-white"
                >${place.name}</span
              >
              <span class="font-mono text-base font-bold ${metal.text}"
                >${place.value}</span
              >
              <span class="text-[11px] text-white/45">${place.unit}</span>
            </div>
          `
        : nothing}
      <div
        class="mt-2 w-full ${metal.plinth} rounded-t-md border-t-[3px] bg-gradient-to-b from-white/[0.07] to-white/[0.02] flex items-start justify-center pt-1"
        style="border-top-color:${metal.top}"
        aria-hidden="true"
      >
        <span class="font-display text-2xl font-bold text-white/15"
          >${index + 1}</span
        >
      </div>
    </div>
  `;
}

// A round medal in the place's metal, its number struck in the middle.
function medal(n: number, id: string) {
  const metal = METALS[n - 1];
  return html`<svg
    width="38"
    height="38"
    viewBox="0 0 38 38"
    aria-label=${translateText("leaderboard_modal.podium_place", { n })}
  >
    <defs>
      <linearGradient id=${id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color=${metal.top} />
        <stop offset="1" stop-color=${metal.bottom} />
      </linearGradient>
    </defs>
    <circle cx="19" cy="19" r="17" fill="url(#${id})" />
    <circle
      cx="19"
      cy="19"
      r="13"
      fill="none"
      stroke="#0b1512"
      stroke-opacity="0.35"
      stroke-width="1.5"
    />
    ${svg`<text
      x="19"
      y="24.5"
      text-anchor="middle"
      font-size="15"
      font-weight="800"
      fill="#0b1512"
      fill-opacity="0.8"
    >${n}</text>`}
  </svg>`;
}

// The first place's crown, above its medal.
function crown() {
  return html`<svg
    width="30"
    height="18"
    viewBox="0 0 30 18"
    class="-mb-1"
    aria-hidden="true"
  >
    <path
      d="M3 16h24l2-11-7 5-7-8-7 8-7-5z"
      fill="#f6d36b"
      stroke="#a8741a"
      stroke-width="1.2"
      stroke-linejoin="round"
    />
    <circle cx="15" cy="3" r="1.6" fill="#fff4cf" />
  </svg>`;
}
