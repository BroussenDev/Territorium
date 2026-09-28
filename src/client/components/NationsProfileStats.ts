import { html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { PlayerProfile } from "../../core/ApiSchemas";
import { NationsCountry } from "../../core/game/NationsMode";
import { translateText } from "../Utils";
import { countryFlag, loadNationsCountries } from "./NationsCountries";

// Countries shown before the list folds.
const SHOWN = 8;

// A player's Nations games by country, on their profile. Hidden until they
// have played one.
@customElement("nations-profile-stats")
export class NationsProfileStats extends LitElement {
  @property({ attribute: false })
  nations: NonNullable<PlayerProfile["nations"]> = [];

  @state() private countries: NationsCountry[] | null = null;
  @state() private expanded = false;

  createRenderRoot() {
    return this;
  }

  protected willUpdate(changed: Map<string, unknown>) {
    if (changed.has("nations")) this.expanded = false;
    if (this.nations.length > 0 && this.countries === null) {
      loadNationsCountries()
        .then((c) => (this.countries = c))
        .catch((e) => console.warn("nations-profile-stats: no countries", e));
    }
  }

  render() {
    const countries = this.countries;
    const nations = this.nations.filter((n) => countries?.[n.nation]);
    if (countries === null || nations.length === 0) return nothing;

    const games = nations.reduce((sum, n) => sum + n.games, 0);
    const wins = nations.reduce((sum, n) => sum + n.wins, 0);
    const shown = this.expanded ? nations : nations.slice(0, SHOWN);

    return html`
      <section
        class="mb-6 rounded-2xl bg-white/5 border border-white/10 p-4 flex flex-col gap-3"
      >
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <h3 class="text-white font-bold">
            ${translateText("player_profile.nations_title")}
          </h3>
          <span class="text-xs text-white/60">
            ${translateText("player_profile.nations_record", {
              games,
              wins,
            })}
          </span>
        </div>
        <ul class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          ${shown.map((n) => {
            const country = countries[n.nation];
            return html`
              <li
                class="flex items-center gap-3 rounded-xl bg-black/20 px-3 py-2 min-w-0"
              >
                ${countryFlag(country, "h-6")}
                <span class="flex-1 min-w-0 text-white font-medium truncate"
                  >${country.name}</span
                >
                <span class="text-xs text-white/60 whitespace-nowrap">
                  ${translateText("player_profile.nations_country_record", {
                    games: n.games,
                    wins: n.wins,
                  })}
                </span>
              </li>
            `;
          })}
        </ul>
        ${nations.length > SHOWN
          ? html`<button
              class="self-start text-xs font-bold text-emerald-300 hover:text-emerald-200"
              @click=${() => (this.expanded = !this.expanded)}
            >
              ${this.expanded
                ? translateText("player_profile.nations_show_less")
                : translateText("player_profile.nations_show_all", {
                    count: nations.length,
                  })}
            </button>`
          : nothing}
      </section>
    `;
  }
}
