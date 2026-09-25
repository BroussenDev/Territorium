import { html, TemplateResult } from "lit";
import { translateText } from "../../Utils";

// The gold frame the top subscription tier puts around a player's name on
// the leaderboards and their profile. Out-of-match only: games never show it.
export function goldFramed(
  framed: boolean | undefined,
  content: TemplateResult,
): TemplateResult {
  if (!framed) return content;
  return html`<span
    data-gold-frame
    title=${translateText("leaderboard_modal.gold_frame")}
    class="inline-flex min-w-0 max-w-full items-center rounded-lg border border-amber-300/80 bg-gradient-to-r from-amber-400/20 via-yellow-200/10 to-amber-500/20 px-2 py-0.5 shadow-[0_0_12px_rgba(251,191,36,0.45)]"
    >${content}</span
  >`;
}
