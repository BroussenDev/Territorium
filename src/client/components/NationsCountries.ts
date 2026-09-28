import { html, nothing } from "lit";
import { assetUrl } from "../../core/AssetUrls";
import { GameMapType } from "../../core/game/Game";
import { NationsCountry } from "../../core/game/NationsMode";
import { terrainMapFileLoader } from "../TerrainMapFileLoader";

let countriesPromise: Promise<NationsCountry[]> | null = null;

// The giant world map's countries (countries.json), loaded once per page for
// the Nations stats. Indexes match the ones the API stores.
export function loadNationsCountries(): Promise<NationsCountry[]> {
  countriesPromise ??= terrainMapFileLoader.getMapData(
    GameMapType.GiantWorldMap,
  ).countriesJson!()
    .then((json) => json.countries)
    .catch((e) => {
      countriesPromise = null;
      throw e;
    });
  return countriesPromise;
}

export function countryFlag(country: NationsCountry | undefined, size = "h-4") {
  return country?.flag
    ? html`<img
        src=${assetUrl(`flags/${country.flag}.svg`)}
        alt=""
        class="${size} w-auto rounded-sm shadow shrink-0"
      />`
    : nothing;
}
