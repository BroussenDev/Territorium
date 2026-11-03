import { assetUrl } from "../../../core/AssetUrls";
import { Config } from "../../../core/configuration/Config";
import {
  BuildableAttacks,
  bulkCost,
  maxBulkAmount,
  NUKE_BULK_STEPS,
  PlayerActions,
  PlayerBuildableUnitType,
  STRUCTURE_BULK_STEPS,
  Structures,
  UnitType,
} from "../../../core/game/Game";
import { TileRef } from "../../../core/game/GameMap";
import { findClosestBy } from "../../../core/Util";
import { UIState } from "../../UIState";
import { renderNumber, translateText } from "../../Utils";
import { GameView, PlayerView } from "../../view";
import { BuildItemDisplay, BuildMenu, flattenedBuildTable } from "./BuildMenu";
import { ChatIntegration } from "./ChatIntegration";
import { EmojiTable } from "./EmojiTable";
import { PlayerActionHandler } from "./PlayerActionHandler";
import { PlayerPanel } from "./PlayerPanel";
import { TooltipItem } from "./RadialMenu";

import { EventBus } from "../../../core/EventBus";
import {
  BuildUnitIntentEvent,
  SendUpgradeStructureIntentEvent,
} from "../../Transport";
const allianceIcon = assetUrl("images/AllianceIconWhite.svg");
const boatIcon = assetUrl("images/BoatIconWhite.svg");
const buildIcon = assetUrl("images/BuildIconWhite.svg");
const donateGoldIcon = assetUrl("images/DonateGoldIconWhite.svg");
const infoIcon = assetUrl("images/InfoIcon.svg");
const swordIcon = assetUrl("images/SwordIconWhite.svg");
const traitorIcon = assetUrl("images/TraitorIconWhite.svg");
const whiteFlagIcon = assetUrl("images/WhiteFlagIconWhite.svg");
const xIcon = assetUrl("images/XIcon.svg");

export interface MenuElementParams {
  myPlayer: PlayerView;
  selected: PlayerView | null;
  tile: TileRef;
  playerActions: PlayerActions;
  game: GameView;
  buildMenu: BuildMenu;
  emojiTable: EmojiTable;
  playerActionHandler: PlayerActionHandler;
  playerPanel: PlayerPanel;
  chatIntegration: ChatIntegration;
  eventBus: EventBus;
  uiState?: UIState;
  closeMenu: () => void;
}

export interface MenuElement {
  id: string;
  name: string;
  displayed?: boolean | ((params: MenuElementParams) => boolean);
  color?: string | ((params: MenuElementParams) => string);
  icon?: string;
  text?: string;
  fontSize?: string;
  tooltipItems?: TooltipItem[];
  tooltipKeys?: TooltipKey[];

  cooldown?: (params: MenuElementParams) => number;
  disabled: (params: MenuElementParams) => boolean;
  action?: (params: MenuElementParams) => void; // For leaf items that perform actions
  subMenu?: (params: MenuElementParams) => MenuElement[]; // For non-leaf items that open submenus

  renderType?: string;

  timerFraction?: (params: MenuElementParams) => number; // 0..1, for arc timer overlay
}

export interface TooltipKey {
  key: string;
  className: string;
  params?: Record<string, string | number>;
}

export interface CenterButtonElement {
  disabled: (params: MenuElementParams) => boolean;
  action: (params: MenuElementParams) => void;
}

/**
 * Territorium's radial palette: neutral slices are night-green plates; action
 * colours keep their meaning (red attacks, emerald allies, gold builds).
 */
export const COLORS = {
  build: "#f2b632",
  building: "#14382c",
  boat: "#2b7fb8",
  disabled: "#3a5047",
  ally: "#10b981",
  breakAlly: "#dc2626",
  breakAllyNoDebuff: "#d97706",
  delete: "#dc3b3b",
  info: "#24392f",
  target: "#dc3b3b",
  attack: "#dc3b3b",
  infoDetails: "#3a5047",
  infoEmoji: "#f2b632",
  trade: "#0891b2",
  embargo: "#7c3aed",
  peace: "#14b8a6",
  tooltip: {
    cost: "#f59e0b",
    count: "#94a3b8",
  },
  chat: {
    default: "#6366f1",
    help: "#22c55e",
    attack: "#ef4444",
    defend: "#3b82f6",
    greet: "#f97316",
    misc: "#a855f7",
    warnings: "#fbbf24",
  },
};

export enum Slot {
  Info = "info",
  Boat = "boat",
  Build = "build",
  Attack = "attack",
  Ally = "ally",
  Back = "back",
  Delete = "delete",
}

function isFriendlyTarget(params: MenuElementParams): boolean {
  const selectedPlayer = params.selected;
  if (selectedPlayer === null) return false;
  const isFriendly = (selectedPlayer as PlayerView).isFriendly;
  if (typeof isFriendly !== "function") return false;
  return isFriendly.call(selectedPlayer, params.myPlayer);
}

function isDisconnectedTarget(params: MenuElementParams): boolean {
  const selectedPlayer = params.selected;
  if (selectedPlayer === null) return false;
  const isDisconnected = (selectedPlayer as PlayerView).isDisconnected;
  if (typeof isDisconnected !== "function") return false;
  return isDisconnected.call(selectedPlayer);
}

const allyRequestElement: MenuElement = {
  id: "ally_request",
  name: "request",
  disabled: (params: MenuElementParams) =>
    !params.playerActions?.interaction?.canSendAllianceRequest,
  displayed: (params: MenuElementParams) =>
    !params.playerActions?.interaction?.canBreakAlliance,
  color: COLORS.ally,
  icon: allianceIcon,
  action: (params: MenuElementParams) => {
    params.playerActionHandler.handleAllianceRequest(
      params.myPlayer,
      params.selected!,
    );
    params.closeMenu();
  },
};

const allyExtendElement: MenuElement = {
  id: "ally_extend",
  name: "extend",
  displayed: (params: MenuElementParams) =>
    !!params.playerActions?.interaction?.allianceInfo?.inExtensionWindow,
  disabled: (params: MenuElementParams) =>
    !params.playerActions?.interaction?.allianceInfo?.canExtend,
  color: COLORS.ally,
  icon: allianceIcon,
  action: (params: MenuElementParams) => {
    if (!params.playerActions?.interaction?.allianceInfo?.canExtend) return;
    params.playerActionHandler.handleExtendAlliance(params.selected!);
    params.closeMenu();
  },
  timerFraction: (params: MenuElementParams): number => {
    const interaction = params.playerActions?.interaction;
    if (!interaction?.allianceInfo) return 1;
    const remaining = Math.max(
      0,
      interaction.allianceInfo.expiresAt - params.game.ticks(),
    );
    const extensionWindow = Math.max(
      1,
      params.game.config().allianceExtensionPromptOffset(),
    );
    return Math.max(0, Math.min(1, remaining / extensionWindow));
  },
  renderType: "allyExtend",
};

const allyBreakElement: MenuElement = {
  id: "ally_break",
  name: "break",
  disabled: (params: MenuElementParams) =>
    !params.playerActions?.interaction?.canBreakAlliance,
  displayed: (params: MenuElementParams) =>
    !!params.playerActions?.interaction?.canBreakAlliance,
  color: (params: MenuElementParams) =>
    params.selected?.isTraitor() || params.selected?.isDisconnected()
      ? COLORS.breakAllyNoDebuff
      : COLORS.breakAlly,
  icon: traitorIcon,
  action: (params: MenuElementParams) => {
    params.playerActionHandler.handleBreakAlliance(
      params.myPlayer,
      params.selected!,
    );
    params.closeMenu();
  },
};

const peaceRequestElement: MenuElement = {
  id: "peace_request",
  name: "peace",
  disabled: (params: MenuElementParams) =>
    !params.playerActions?.interaction?.canProposePeace,
  color: COLORS.peace,
  icon: whiteFlagIcon,
  action: (params: MenuElementParams) => {
    params.playerActionHandler.handleProposePeace(params.selected!);
    params.closeMenu();
  },
};

// Stands where the boat button is: no boat can land on a player at peace.
// The timer ring shows how long the treaty still runs.
const peaceBreakElement: MenuElement = {
  id: "peace_break",
  name: "break peace",
  disabled: () => false,
  color: COLORS.breakAlly,
  icon: traitorIcon,
  action: (params: MenuElementParams) => {
    params.playerActionHandler.handleBreakPeace(params.selected!);
    params.closeMenu();
  },
  timerFraction: (params: MenuElementParams): number => {
    const expiresAt = params.playerActions?.interaction?.peaceExpiresAt;
    if (expiresAt === undefined) return 1;
    const remaining = Math.max(0, expiresAt - params.game.ticks());
    return Math.min(1, remaining / params.game.config().peaceDuration());
  },
};

export const infoMenuElement: MenuElement = {
  id: Slot.Info,
  name: "info",
  disabled: (params: MenuElementParams) =>
    !params.selected || params.game.inSpawnPhase(),
  icon: infoIcon,
  color: COLORS.info,
  action: (params: MenuElementParams) => {
    params.playerPanel.show(params.playerActions, params.tile);
  },
};

function getAllEnabledUnits(
  myPlayer: boolean,
  config: Config,
): Set<PlayerBuildableUnitType> {
  const units: Set<PlayerBuildableUnitType> =
    new Set<PlayerBuildableUnitType>();

  const addIfEnabled = (unitType: PlayerBuildableUnitType) => {
    if (!config.isUnitDisabled(unitType)) {
      units.add(unitType);
    }
  };

  if (myPlayer) {
    Structures.types.forEach(addIfEnabled);
  } else {
    BuildableAttacks.types.forEach(addIfEnabled);
  }

  return units;
}

function createMenuElements(
  params: MenuElementParams,
  filterType: "attack" | "build",
  elementIdPrefix: string,
): MenuElement[] {
  const unitTypes: Set<PlayerBuildableUnitType> = getAllEnabledUnits(
    params.selected === params.myPlayer,
    params.game.config(),
  );

  return flattenedBuildTable
    .filter(
      (item) =>
        unitTypes.has(item.unitType) &&
        (filterType === "attack"
          ? BuildableAttacks.has(item.unitType)
          : !BuildableAttacks.has(item.unitType)),
    )
    .map((item: BuildItemDisplay) => {
      return {
        id: `${elementIdPrefix}_${item.unitType}`,
        name: item.key
          ? item.key.replace("unit_type.", "")
          : item.unitType.toString(),
        disabled: (p: MenuElementParams) =>
          !p.buildMenu.canBuildOrUpgrade(item),
        color: (p: MenuElementParams) =>
          p.buildMenu.canBuildOrUpgrade(item)
            ? filterType === "attack"
              ? COLORS.attack
              : COLORS.building
            : COLORS.building,
        icon: item.icon,
        tooltipItems: [
          { text: translateText(item.key ?? ""), className: "title" },
          {
            text: translateText(item.description ?? ""),
            className: "description",
          },
          {
            text: `${renderNumber(params.buildMenu.cost(item))} ${translateText("player_panel.gold")}`,
            className: "cost",
          },
          item.countable
            ? { text: `${params.buildMenu.count(item)}x`, className: "count" }
            : null,
        ].filter(
          (tooltipItem): tooltipItem is TooltipItem => tooltipItem !== null,
        ),
        subMenu: (params: MenuElementParams) => {
          const buildableUnit = params.playerActions.buildableUnits.find(
            (bu) => bu.type === item.unitType,
          );
          if (!buildableUnit) {
            return [];
          }
          const isStackableNuke =
            item.unitType === UnitType.AtomBomb &&
            buildableUnit.canBuild !== false;
          if (
            (buildableUnit.canUpgrade === false && !isStackableNuke) ||
            !params.buildMenu.canBuildOrUpgrade(item)
          ) {
            return [];
          }
          // Always four slots in fixed positions for muscle memory — laid
          // out clockwise from the top: x1, the two fixed steps, then the
          // largest amount the player can execute right now (bombs: top x1,
          // right x2, bottom x5, left xMax). max is capped by gold, and for
          // nukes by loaded silo tubes; slots beyond it render disabled.
          // With no executable amount past x1 there is nothing to choose —
          // return no submenu so the click falls through to an immediate x1
          // (see action below).
          const myPlayer = params.game.myPlayer();
          let maxAmount = maxBulkAmount(buildableUnit, myPlayer?.gold() ?? 0n);
          if (isStackableNuke) {
            maxAmount = Math.min(maxAmount, myPlayer?.readyMissileCount() ?? 0);
          }
          if (maxAmount <= 1) {
            return [];
          }
          const steps = isStackableNuke
            ? NUKE_BULK_STEPS
            : STRUCTURE_BULK_STEPS;
          const slots = [1, ...steps, maxAmount];
          return slots.map((amount, i) => {
            const isMaxSlot = i === slots.length - 1;
            const executable = amount <= maxAmount;
            const cost = bulkCost(buildableUnit, amount);
            return {
              id: isMaxSlot
                ? `upgrade_${item.unitType}_max`
                : `upgrade_${item.unitType}_${amount}`,
              name: translateText("build_menu.upgrade_amount", {
                amount: amount.toString(),
              }),
              text: translateText("build_menu.upgrade_amount", {
                amount: amount.toString(),
              }),
              fontSize: "20px",
              color: (p: MenuElementParams) =>
                executable && (p.game.myPlayer()?.gold() ?? 0n) >= cost
                  ? COLORS.building
                  : COLORS.disabled,
              icon: "",
              tooltipItems: [
                {
                  text: translateText("radial_menu.upgrade_x", {
                    amount: amount.toString(),
                  }),
                  className: "title",
                },
                {
                  text: `${renderNumber(cost)} ${translateText("player_panel.gold")}`,
                  className: "cost",
                },
              ],
              disabled: (p: MenuElementParams) =>
                !executable || (p.game.myPlayer()?.gold() ?? 0n) < cost,
              action: (p: MenuElementParams) => {
                if (isStackableNuke) {
                  p.eventBus.emit(
                    new BuildUnitIntentEvent(
                      buildableUnit.type,
                      p.tile,
                      p.uiState?.rocketDirectionUp,
                      amount,
                    ),
                  );
                } else {
                  p.eventBus.emit(
                    new SendUpgradeStructureIntentEvent(
                      buildableUnit.canUpgrade as number,
                      buildableUnit.type,
                      amount,
                    ),
                  );
                }
                p.closeMenu();
              },
            };
          });
        },
        action: (params: MenuElementParams) => {
          const buildableUnit = params.playerActions.buildableUnits.find(
            (bu) => bu.type === item.unitType,
          );
          if (buildableUnit === undefined) {
            return;
          }
          if (params.buildMenu.canBuildOrUpgrade(item)) {
            if (buildableUnit.canUpgrade !== false) {
              params.eventBus.emit(
                new SendUpgradeStructureIntentEvent(
                  buildableUnit.canUpgrade,
                  buildableUnit.type,
                ),
              );
            } else if (buildableUnit.canBuild !== false) {
              const rocketDirectionUp =
                item.unitType === UnitType.AtomBomb ||
                item.unitType === UnitType.HydrogenBomb ||
                item.unitType === UnitType.EMPBomb
                  ? params.uiState?.rocketDirectionUp
                  : undefined;
              params.eventBus.emit(
                new BuildUnitIntentEvent(
                  buildableUnit.type,
                  params.tile,
                  rocketDirectionUp,
                ),
              );
            }
          }
          params.closeMenu();
        },
      };
    });
}

export const attackMenuElement: MenuElement = {
  id: Slot.Attack,
  name: "radial_attack",
  disabled: (params: MenuElementParams) => params.game.inSpawnPhase(),
  icon: swordIcon,
  color: COLORS.attack,

  subMenu: (params: MenuElementParams) => {
    if (params === undefined) return [];
    return createMenuElements(params, "attack", "attack");
  },
};

const donateGoldRadialElement: MenuElement = {
  id: Slot.Attack,
  name: "radial_donate_gold",
  disabled: (params: MenuElementParams) =>
    params.game.inSpawnPhase() ||
    !params.playerActions?.interaction?.canDonateGold,
  icon: donateGoldIcon,
  color: "#f59e0b",
  action: (params: MenuElementParams) => {
    if (!params.selected) return;
    params.playerPanel.openSendGoldModal(
      params.playerActions,
      params.tile,
      params.selected,
    );
  },
};

export const deleteUnitElement: MenuElement = {
  id: Slot.Delete,
  name: "delete",
  cooldown: (params: MenuElementParams) => params.myPlayer.deleteUnitCooldown(),
  disabled: (params: MenuElementParams) => {
    const tileOwner = params.game.owner(params.tile);
    const isLand = params.game.isLand(params.tile);

    if (!tileOwner.isPlayer() || tileOwner.id() !== params.myPlayer.id()) {
      return true;
    }

    if (!isLand) {
      return true;
    }

    if (params.game.inSpawnPhase()) {
      return true;
    }

    if (params.myPlayer.deleteUnitCooldown() > 0) {
      return true;
    }

    const DELETE_SELECTION_RADIUS = 5;
    const myUnits = params.myPlayer
      .units()
      .filter(
        (unit) =>
          !unit.isUnderConstruction() &&
          unit.markedForDeletion() === false &&
          Structures.has(unit.type()) &&
          params.game.manhattanDist(unit.tile(), params.tile) <=
            DELETE_SELECTION_RADIUS,
      );

    return myUnits.length === 0;
  },
  icon: xIcon,
  color: COLORS.delete,
  tooltipKeys: [
    {
      key: "radial_menu.delete_unit_title",
      className: "title",
    },
    {
      key: "radial_menu.delete_unit_description",
      className: "description",
    },
  ],
  action: (params: MenuElementParams) => {
    const DELETE_SELECTION_RADIUS = 5;
    const myUnits = params.myPlayer
      .units()
      .filter(
        (unit) =>
          !unit.isUnderConstruction() &&
          unit.markedForDeletion() === false &&
          Structures.has(unit.type()) &&
          params.game.manhattanDist(unit.tile(), params.tile) <=
            DELETE_SELECTION_RADIUS,
      );

    const closestUnit = findClosestBy(myUnits, (unit) =>
      params.game.manhattanDist(unit.tile(), params.tile),
    );
    if (closestUnit) {
      params.playerActionHandler.handleDeleteUnit(closestUnit.id());
    }

    params.closeMenu();
  },
};

export const buildMenuElement: MenuElement = {
  id: Slot.Build,
  name: "build",
  disabled: (params: MenuElementParams) => params.game.inSpawnPhase(),
  icon: buildIcon,
  color: COLORS.build,

  subMenu: (params: MenuElementParams) => {
    if (params === undefined) return [];
    return createMenuElements(params, "build", "build");
  },
};

export const boatMenuElement: MenuElement = {
  id: Slot.Boat,
  name: "boat",
  disabled: (params: MenuElementParams) =>
    !params.playerActions.buildableUnits.some(
      (unit) => unit.type === UnitType.TransportShip && unit.canBuild,
    ),
  icon: boatIcon,
  color: COLORS.boat,

  action: async (params: MenuElementParams) => {
    params.playerActionHandler.handleBoatAttack(params.myPlayer, params.tile);

    params.closeMenu();
  },
};

export const centerButtonElement: CenterButtonElement = {
  disabled: (params: MenuElementParams): boolean => {
    const tileOwner = params.game.owner(params.tile);
    const isLand = params.game.isLand(params.tile);
    if (!isLand) {
      return true;
    }
    if (params.game.inSpawnPhase()) {
      if (params.game.config().isRandomSpawn()) {
        return true;
      }
      if (tileOwner.isPlayer()) {
        return true;
      }
      return false;
    }

    if (isFriendlyTarget(params) && !isDisconnectedTarget(params)) {
      return !params.playerActions.interaction?.canDonateTroops;
    }

    return !params.playerActions.canAttack;
  },
  action: (params: MenuElementParams) => {
    if (params.game.inSpawnPhase()) {
      params.playerActionHandler.handleSpawn(params.tile);
    } else {
      if (isFriendlyTarget(params) && !isDisconnectedTarget(params)) {
        const selectedPlayer = params.selected as PlayerView;
        const ratio = params.uiState?.attackRatio ?? 1;
        const troopsToDonate = Math.floor(ratio * params.myPlayer.troops());
        if (troopsToDonate > 0) {
          params.playerActionHandler.handleDonateTroops(
            selectedPlayer,
            troopsToDonate,
          );
        }
      } else {
        params.playerActionHandler.handleAttack(
          params.myPlayer,
          params.selected?.id() ?? null,
        );
      }
    }
    params.closeMenu();
  },
};

export const rootMenuElement: MenuElement = {
  id: "root",
  name: "root",
  disabled: () => false,
  icon: infoIcon,
  color: COLORS.info,
  subMenu: (params: MenuElementParams) => {
    const isAllied = params.selected?.isAlliedWith(params.myPlayer);
    const isDisconnected = isDisconnectedTarget(params);

    const tileOwner = params.game.owner(params.tile);
    const isOwnTerritory =
      tileOwner.isPlayer() &&
      (tileOwner as PlayerView).id() === params.myPlayer.id();

    const inExtensionWindow =
      params.playerActions.interaction?.allianceInfo?.inExtensionWindow;

    const atPeace =
      params.playerActions.interaction?.peaceExpiresAt !== undefined;
    // Peace is for enemies: never for allies, teammates or tribeless land.
    const canTalkPeace =
      !atPeace &&
      !isFriendlyTarget(params) &&
      params.selected !== null &&
      !params.game.inSpawnPhase();

    // After game-over, nukes can target teammates in multiplayer (nukeSpawn allows it,
    // but not in singleplayer). Show the attack submenu so mobile users can access
    // nukes in the aftergame.
    const hasBuildableAttacks =
      params.playerActions.buildableUnits?.some(
        (bu) => BuildableAttacks.has(bu.type) && bu.canBuild !== false,
      ) ?? false;

    const showDonateInsteadOfAttack =
      isFriendlyTarget(params) && !isDisconnected && !hasBuildableAttacks;

    const menuItems: (MenuElement | null)[] = [
      infoMenuElement,
      ...(isOwnTerritory
        ? [deleteUnitElement, allyRequestElement, buildMenuElement]
        : [
            isAllied && !isDisconnected
              ? allyBreakElement
              : atPeace
                ? peaceBreakElement
                : boatMenuElement,
            inExtensionWindow ? allyExtendElement : allyRequestElement,
            canTalkPeace ? peaceRequestElement : null,
            showDonateInsteadOfAttack
              ? donateGoldRadialElement
              : attackMenuElement,
          ]),
    ];

    return menuItems.filter((item): item is MenuElement => item !== null);
  },
};
