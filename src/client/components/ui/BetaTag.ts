import { html } from "lit";
import { translateText } from "../../Utils";

/**
 * Marks a feature still in beta (the map editor). `extraClass` sets its
 * display (inline-flex by default) and placement.
 */
export function betaTag(extraClass = "inline-flex") {
  return html`<span
    data-beta-tag
    title=${translateText("map_editor.beta_hint")}
    class="items-center rounded-sm border border-amber-400/50 bg-amber-400/15 px-1.5 py-0.5 font-sans text-[11px] font-bold leading-none text-amber-200 ${extraClass}"
    >${translateText("map_editor.beta")}</span
  >`;
}
