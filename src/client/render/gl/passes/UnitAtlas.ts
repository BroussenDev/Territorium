/**
 * Column layout of the unit atlas (resources/atlases/unit-atlas.png): one
 * 13×13 cell per column, in UNIT_ORDER. UnitPass draws from it; the store
 * previews and the atlas test read the boat columns from here too.
 */

import {
  TRANSPORT_MODELS,
  type TransportModel,
  WARSHIP_MODELS,
  type WarshipModel,
} from "../../../../core/CosmeticSchemas";
import {
  UT_ATOM_BOMB,
  UT_HYDROGEN_BOMB,
  UT_MIRV,
  UT_MIRV_WARHEAD,
  UT_SAM_MISSILE,
  UT_SHELL,
  UT_TRADE_SHIP,
  UT_TRANSPORT,
  UT_WARSHIP,
} from "../../types";

/** Unit types in atlas column order. Index = atlas column.
 *  TrainEngine/TrainCarriage/TrainCarriageLoaded are synthetic names —
 *  they don't match header.unitTypes directly. Train resolution is
 *  handled specially in UnitPass.updateUnits() via trainType + loaded
 *  fields. The shop's boat models follow, bow up then bow up-right, warship
 *  models first (the warship color effect covers that run of columns).
 */
export const UNIT_ORDER = [
  UT_TRANSPORT,
  UT_TRADE_SHIP,
  UT_WARSHIP,
  UT_ATOM_BOMB,
  UT_HYDROGEN_BOMB,
  UT_MIRV,
  UT_SAM_MISSILE,
  UT_SHELL,
  UT_MIRV_WARHEAD,
  "TrainEngine",
  "TrainCarriage",
  "TrainCarriageLoaded",
  "WarshipDiagonal",
  "TransportDiagonal",
  "carrier",
  "carrierDiagonal",
  "galleon",
  "galleonDiagonal",
  "drakkar",
  "drakkarDiagonal",
  "hovercraft",
  "hovercraftDiagonal",
  "junk",
  "junkDiagonal",
] as const;

export const ATLAS_COLS = UNIT_ORDER.length;

/** A boat oriented by its heading: its bow-up and bow-up-right columns. */
export interface BoatCols {
  readonly straight: number;
  readonly diagonal: number;
}

export type BoatModel = WarshipModel | TransportModel;

function col(name: (typeof UNIT_ORDER)[number]): number {
  return UNIT_ORDER.indexOf(name);
}

function modelCols(model: BoatModel): BoatCols {
  return { straight: col(model), diagonal: col(`${model}Diagonal`) };
}

/** The default warship and transport ship. */
export const DEFAULT_BOAT_COLS = {
  warship: { straight: col(UT_WARSHIP), diagonal: col("WarshipDiagonal") },
  transport: {
    straight: col(UT_TRANSPORT),
    diagonal: col("TransportDiagonal"),
  },
} as const satisfies Record<string, BoatCols>;

export const BOAT_MODEL_COLS: Readonly<Record<BoatModel, BoatCols>> =
  Object.fromEntries(
    [...WARSHIP_MODELS, ...TRANSPORT_MODELS].map((m) => [m, modelCols(m)]),
  ) as Record<BoatModel, BoatCols>;

/** The run of atlas columns holding the warship models. */
export const WARSHIP_MODEL_FIRST_COL = Math.min(
  ...WARSHIP_MODELS.map((m) => BOAT_MODEL_COLS[m].straight),
);
export const WARSHIP_MODEL_LAST_COL = Math.max(
  ...WARSHIP_MODELS.map((m) => BOAT_MODEL_COLS[m].diagonal),
);

export function isWarshipModel(model: BoatModel): model is WarshipModel {
  return (WARSHIP_MODELS as readonly string[]).includes(model);
}
