import { html, TemplateResult } from "lit";
import { translateText } from "../../Utils";

// The gold frame the top subscription tier puts around a player's name on
// the leaderboards and their profile. Out-of-match only: games never show it.
export function goldFramed(
  framed: boolean | undefined,
  content: TemplateResult,
  conqueror?: boolean,
): TemplateResult {
  if (conqueror) return conquerorFramed(content);
  if (!framed) return content;
  return html`<span
    data-gold-frame
    title=${translateText("leaderboard_modal.gold_frame")}
    class="inline-flex min-w-0 max-w-full items-center rounded-lg border border-amber-300/80 bg-gradient-to-r from-amber-400/20 via-yellow-200/10 to-amber-500/20 px-2 py-0.5 shadow-[0_0_12px_rgba(251,191,36,0.45)]"
    >${content}</span
  >`;
}

// The Deluxe edition's frame (Pack Conquérant): crimson and gold, with a
// light sweeping across it, the animated banner of the leaderboards. Takes
// precedence over the subscription's gold frame.
export function conquerorFramed(content: TemplateResult): TemplateResult {
  return html`<style>
      @keyframes conqueror-sweep {
        0% {
          background-position: 200% 0;
        }
        100% {
          background-position: -200% 0;
        }
      }
      [data-conqueror-frame] {
        background-image:
          linear-gradient(
            105deg,
            transparent 35%,
            rgba(255, 228, 150, 0.35) 50%,
            transparent 65%
          ),
          linear-gradient(
            90deg,
            rgba(122, 24, 40, 0.75),
            rgba(94, 17, 32, 0.55)
          );
        background-size:
          250% 100%,
          100% 100%;
        animation: conqueror-sweep 4s linear infinite;
      }
      @media (prefers-reduced-motion: reduce) {
        [data-conqueror-frame] {
          animation: none;
        }
      }
    </style>
    <span
      data-conqueror-frame
      title=${translateText("leaderboard_modal.conqueror_frame")}
      class="inline-flex min-w-0 max-w-full items-center rounded-lg border border-[#e8b84a]/90 px-2 py-0.5 shadow-[0_0_14px_rgba(232,184,74,0.45)]"
      >${content}</span
    >`;
}
