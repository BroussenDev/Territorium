import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";
import { EventBus } from "../../../core/EventBus";
import {
  BuildableUnit,
  BuildMenus,
  Gold,
  PlayerBuildableUnitType,
  UnitType,
} from "../../../core/game/Game";
import { UserSettings } from "../../../core/game/UserSettings";
import { Controller } from "../../Controller";
import { ToggleStructureEvent } from "../../InputHandler";
import { UIState } from "../../UIState";
import { renderNumber, translateText } from "../../Utils";
import { GameView } from "../../view";
import {
  atomBombIcon,
  cityIcon,
  defensePostIcon,
  empBombIcon,
  factoryIcon,
  goldCoinIcon,
  hydrogenBombIcon,
  mirvIcon,
  missileSiloIcon,
  portIcon,
  radarIcon,
  samLauncherIcon,
  warshipIcon,
} from "../HotbarIcons";
import { TutorialHighlight, TutorialHighlightEvent } from "../Tutorial";

@customElement("unit-display")
export class UnitDisplay extends LitElement implements Controller {
  public game: GameView;
  public eventBus: EventBus;
  public uiState: UIState;
  private playerBuildables: BuildableUnit[] | null = null;
  private keybinds: Record<string, { value: string; key: string }> = {};
  private _cities = 0;
  private _warships = 0;
  private _factories = 0;
  private _missileSilo = 0;
  private _port = 0;
  private _defensePost = 0;
  private _samLauncher = 0;
  private _radar = 0;
  private allDisabled = false;
  private _hoveredUnit: PlayerBuildableUnitType | null = null;
  private tutorialHighlight: PlayerBuildableUnitType | null = null;

  createRenderRoot() {
    return this;
  }

  init() {
    const config = this.game.config();
    const userSettings = new UserSettings();

    this.keybinds = userSettings.parsedUserKeybinds();

    this.allDisabled = BuildMenus.types.every((u) => config.isUnitDisabled(u));

    const highlightUnits: Partial<
      Record<TutorialHighlight, PlayerBuildableUnitType>
    > = {
      city: UnitType.City,
      port: UnitType.Port,
      defense_post: UnitType.DefensePost,
      factory: UnitType.Factory,
      warship: UnitType.Warship,
      silo: UnitType.MissileSilo,
      atom: UnitType.AtomBomb,
      hydrogen: UnitType.HydrogenBomb,
      mirv: UnitType.MIRV,
      sam: UnitType.SAMLauncher,
    };
    this.eventBus.on(TutorialHighlightEvent, (e) => {
      this.tutorialHighlight = (e.target && highlightUnits[e.target]) ?? null;
      this.requestUpdate();
    });
    this.requestUpdate();
  }

  private cost(item: UnitType): Gold {
    for (const bu of this.playerBuildables ?? []) {
      if (bu.type === item) {
        return bu.cost;
      }
    }
    return 0n;
  }

  private canBuild(item: UnitType): boolean {
    if (this.game?.config().isUnitDisabled(item)) return false;
    const player = this.game?.myPlayer();
    switch (item) {
      case UnitType.AtomBomb:
      case UnitType.HydrogenBomb:
      case UnitType.MIRV:
      case UnitType.EMPBomb:
        return (
          this.cost(item) <= (player?.gold() ?? 0n) &&
          (player?.units(UnitType.MissileSilo).length ?? 0) > 0
        );
      case UnitType.Warship:
        return (
          this.cost(item) <= (player?.gold() ?? 0n) &&
          (player?.units(UnitType.Port).length ?? 0) > 0
        );
      default:
        return this.cost(item) <= (player?.gold() ?? 0n);
    }
  }

  tick() {
    const player = this.game?.myPlayer();
    if (!player) return;
    player.buildables(undefined, BuildMenus.types).then((buildables) => {
      this.playerBuildables = buildables;
    });
    this._cities = player.totalUnitLevels(UnitType.City);
    this._missileSilo = player.totalUnitLevels(UnitType.MissileSilo);
    this._port = player.totalUnitLevels(UnitType.Port);
    this._defensePost = player.totalUnitLevels(UnitType.DefensePost);
    this._samLauncher = player.totalUnitLevels(UnitType.SAMLauncher);
    this._factories = player.totalUnitLevels(UnitType.Factory);
    this._warships = player.totalUnitLevels(UnitType.Warship);
    this._radar = player.totalUnitLevels(UnitType.Radar);
    this.requestUpdate();
  }

  render() {
    const myPlayer = this.game?.myPlayer();
    if (
      !this.game ||
      !myPlayer ||
      this.game.inSpawnPhase() ||
      !myPlayer.isAlive()
    ) {
      return null;
    }
    if (this.allDisabled) {
      return null;
    }
    const config = this.game.config();

    const groups = this.groups()
      .map((group) =>
        group.filter(([, , unitType]) => !config.isUnitDisabled(unitType)),
      )
      .filter((group) => group.length > 0);

    return html`
      <div class="border-t border-white/10 px-1 py-1 w-full">
        <div class="flex items-stretch gap-1.5 w-full">
          ${groups.map(
            (group) => html`
              <div
                style="flex: ${group.length} 1 0"
                class="hotbar-group flex gap-0.5 p-0.5 rounded-md border border-white/10 bg-black/25"
              >
                ${group.map(([icon, count, unitType, key, bind, fallback]) =>
                  this.renderUnitItem(
                    icon,
                    count,
                    unitType,
                    key,
                    this.keybinds[bind]?.key ?? fallback,
                  ),
                )}
              </div>
            `,
          )}
        </div>
      </div>
    `;
  }

  // The build bar's groups, in the build menu's order: economy, defense,
  // navy and missiles. Each entry: icon, count owned (null for missiles),
  // unit, translation key, keybind name and default key.
  private groups(): [
    string,
    number | null,
    PlayerBuildableUnitType,
    string,
    string,
    string,
  ][][] {
    return [
      [
        [cityIcon, this._cities, UnitType.City, "city", "buildCity", "1"],
        [
          factoryIcon,
          this._factories,
          UnitType.Factory,
          "factory",
          "buildFactory",
          "2",
        ],
        [portIcon, this._port, UnitType.Port, "port", "buildPort", "3"],
      ],
      [
        [
          defensePostIcon,
          this._defensePost,
          UnitType.DefensePost,
          "defense_post",
          "buildDefensePost",
          "4",
        ],
        [
          missileSiloIcon,
          this._missileSilo,
          UnitType.MissileSilo,
          "missile_silo",
          "buildMissileSilo",
          "5",
        ],
        [
          samLauncherIcon,
          this._samLauncher,
          UnitType.SAMLauncher,
          "sam_launcher",
          "buildSamLauncher",
          "6",
        ],
        [radarIcon, this._radar, UnitType.Radar, "radar", "buildRadar", "V"],
      ],
      [
        [
          warshipIcon,
          this._warships,
          UnitType.Warship,
          "warship",
          "buildWarship",
          "7",
        ],
      ],
      [
        [
          atomBombIcon,
          null,
          UnitType.AtomBomb,
          "atom_bomb",
          "buildAtomBomb",
          "8",
        ],
        [
          hydrogenBombIcon,
          null,
          UnitType.HydrogenBomb,
          "hydrogen_bomb",
          "buildHydrogenBomb",
          "9",
        ],
        [empBombIcon, null, UnitType.EMPBomb, "emp_bomb", "buildEmpBomb", "X"],
        [mirvIcon, null, UnitType.MIRV, "mirv", "buildMIRV", "0"],
      ],
    ];
  }

  private renderUnitItem(
    icon: string,
    number: number | null,
    unitType: PlayerBuildableUnitType,
    structureKey: string,
    hotkey: string,
  ) {
    const selected = this.uiState.ghostStructure === unitType;
    const hovered = this._hoveredUnit === unitType;
    const displayHotkey = hotkey
      .replace("Digit", "")
      .replace("Key", "")
      .toUpperCase();

    return html`
      <div
        class="flex flex-col items-center relative flex-1 min-w-0"
        @mouseenter=${() => {
          this._hoveredUnit = unitType;
          this.requestUpdate();
        }}
        @mouseleave=${() => {
          this._hoveredUnit = null;
          this.requestUpdate();
        }}
      >
        ${hovered
          ? html`
              <div
                class="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 text-gray-200 text-center w-max text-xs bg-gray-800/90 backdrop-blur-xs rounded-sm p-1 z-[100] shadow-lg pointer-events-none"
              >
                <div class="font-bold text-sm mb-1">
                  ${translateText(
                    "unit_type." + structureKey,
                  )}${` [${displayHotkey}]`}
                </div>
                <div class="p-2">
                  ${translateText("build_menu.desc." + structureKey)}
                </div>
                ${unitType === UnitType.Warship
                  ? html`<div
                      class="mt-1 px-2 py-1 text-[10px] text-cyan-300 border-t border-white/10"
                    >
                      ⇧ ${translateText("build_menu.warship_shift_hint")}
                    </div>`
                  : null}
                <div class="flex items-center justify-center gap-1">
                  <img src=${goldCoinIcon} width="13" height="13" />
                  <span class="text-yellow-300"
                    >${renderNumber(this.cost(unitType))}</span
                  >
                </div>
              </div>
            `
          : null}
        <div
          class="hotbar-tile relative flex flex-col items-center w-full h-[2.6rem] pt-2.5 rounded border cursor-pointer text-white transition-colors ${selected
            ? "hotbar-tile-selected border-amber-300 bg-amber-300/15"
            : "border-transparent hover:bg-white/10"} ${this.canBuild(unitType)
            ? ""
            : "opacity-40"} ${this.tutorialHighlight === unitType
            ? "tutorial-highlight"
            : ""}"
          @click=${() => {
            if (selected) {
              this.uiState.ghostStructure = null;
            } else if (this.canBuild(unitType)) {
              this.uiState.ghostStructure = unitType;
            }
            this.requestUpdate();
          }}
          @mouseenter=${() => {
            switch (unitType) {
              case UnitType.AtomBomb:
              case UnitType.HydrogenBomb:
              case UnitType.EMPBomb:
                this.eventBus?.emit(
                  new ToggleStructureEvent([
                    UnitType.MissileSilo,
                    UnitType.SAMLauncher,
                  ]),
                );
                break;
              case UnitType.Warship:
                this.eventBus?.emit(new ToggleStructureEvent([UnitType.Port]));
                break;
              default:
                this.eventBus?.emit(new ToggleStructureEvent([unitType]));
            }
          }}
          @mouseleave=${() =>
            this.eventBus?.emit(new ToggleStructureEvent(null))}
        >
          <span
            class="hotbar-key absolute top-0.5 left-1 text-[9px] font-bold leading-none text-gray-400"
            >${displayHotkey}</span
          >
          <img src=${icon} alt=${structureKey} class="size-5" />
          ${this.renderTileFooter(unitType, number)}
        </div>
      </div>
    `;
  }

  // Under the icon: how many you own, or a missile's price.
  private renderTileFooter(unitType: UnitType, number: number | null) {
    if (number !== null) {
      return html`<span
        class="mt-0.5 text-[10px] font-bold leading-none tabular-nums ${number >
        0
          ? "text-white"
          : "text-white/35"}"
        >${renderNumber(number)}</span
      >`;
    }
    const cost = this.cost(unitType);
    return cost > 0n
      ? html`<span
          class="hotbar-price mt-0.5 text-[9px] font-bold leading-none tabular-nums text-yellow-300"
          >${renderNumber(cost)}</span
        >`
      : null;
  }
}
