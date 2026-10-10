import { assetUrl } from "../core/AssetUrls";
import { setCustomMapServer } from "../core/game/CustomMaps";
import { FetchGameMapLoader } from "../core/game/FetchGameMapLoader";
import { getApiBase } from "./ApiBase";

export const terrainMapFileLoader = new FetchGameMapLoader((path) =>
  assetUrl(`maps/${path}`),
);

// Published community maps come from the API (core/game/CustomMaps.ts).
setCustomMapServer(getApiBase);
