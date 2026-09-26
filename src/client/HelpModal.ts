import { html, svg, SVGTemplateResult, TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { textDirection, translateText } from "../client/Utils";
import { assetUrl } from "../core/AssetUrls";
import { UserSettings } from "../core/game/UserSettings";
import { BaseModal } from "./components/BaseModal";
import "./components/Difficulties";
import { modalHeader } from "./components/ui/ModalHeader";
import { Platform } from "./Platform";
import { TroubleshootingModal } from "./TroubleshootingModal";

@customElement("help-modal")
export class HelpModal extends BaseModal {
  protected routerName = "help";

  @state() private keybinds: Record<string, string> = this.getKeybinds();

  private getKeybinds(): Record<string, string> {
    return new UserSettings().keybinds(Platform.isMac);
  }

  private getKeyLabel(code: string): string {
    if (!code) return "";

    const specialLabels: Record<string, string> = {
      ShiftLeft: "⇧ Shift",
      ShiftRight: "⇧ Shift",
      ControlLeft: "Ctrl",
      ControlRight: "Ctrl",
      AltLeft: "Alt",
      AltRight: "Alt",
      MetaLeft: "⌘",
      MetaRight: "⌘",
      Space: "Space",
      Escape: "Esc",
      Enter: "↵ Return",
      ArrowUp: "↑",
      ArrowDown: "↓",
      ArrowLeft: "←",
      ArrowRight: "→",
      Period: ">",
      Comma: "<",
    };

    if (specialLabels[code]) return specialLabels[code];
    if (code.startsWith("Key") && code.length === 4) return code.slice(3);
    if (code.startsWith("Digit")) return code.slice(5);
    if (code.startsWith("Numpad")) return `Num ${code.slice(6)}`;

    return code;
  }

  private renderKey(code: string) {
    const label = this.getKeyLabel(code);
    // Key names stay left-to-right even inside RTL locales so the badges
    // (and combos like "Shift + click") never scramble.
    return html`<span
      dir="ltr"
      class="inline-block min-w-[32px] text-center px-2 py-1 rounded bg-[#2a2a2a] border-b-2 border-[#1a1a1a] text-white font-mono text-xs font-bold mx-0.5"
      >${label}</span
    >`;
  }

  protected renderHeaderSlot() {
    return modalHeader({
      title: translateText("main.help"),
      onBack: () => this.close(),
      ariaLabel: translateText("common.back"),
    });
  }

  private sectionTitle(icon: SVGTemplateResult, key: string) {
    return html`
      <div class="flex items-center gap-3 mb-4 mt-10">
        <div class="text-emerald-400 shrink-0">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="w-5 h-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            ${icon}
          </svg>
        </div>
        <h3
          class="!m-0 text-xl font-bold uppercase tracking-widest text-white/90"
        >
          ${translateText(key)}
        </h3>
        <div
          class="flex-1 h-px bg-gradient-to-r from-emerald-500/50 to-transparent"
        ></div>
      </div>
    `;
  }

  private bullets(keys: string[]) {
    return html`<ul class="!mb-0">
      ${keys.map((k) => html`<li>${translateText(`help_modal.${k}`)}</li>`)}
    </ul>`;
  }

  /** A screenshot with its caption and explanation beside it. */
  private figure(
    image: string,
    titleKey: string,
    body: TemplateResult,
    imageWidth = "max-w-[300px]",
  ) {
    return html`
      <div
        class="bg-black/20 rounded-xl border border-white/10 p-5 flex flex-col md:flex-row gap-5"
      >
        <div class="flex flex-col items-center gap-2 shrink-0">
          <span
            class="text-xs font-bold uppercase tracking-wider text-emerald-300"
            >${translateText(`help_modal.${titleKey}`)}</span
          >
          <img
            src=${assetUrl(`images/helpModal/${image}`)}
            alt=""
            class="rounded-lg shadow-lg border border-white/20 w-full ${imageWidth}"
            loading="lazy"
          />
        </div>
        <div class="flex flex-col justify-center text-white/70 text-sm">
          ${body}
        </div>
      </div>
    `;
  }

  private buildRow(unitKey: string, icon: string, descKey: string) {
    return html`
      <tr class="bg-white/5">
        <td class="py-3 ps-4 border-b border-white/5 font-medium">
          ${translateText(`unit_type.${unitKey}`)}
        </td>
        <td class="py-3 border-b border-white/5">
          <img
            src=${assetUrl(icon)}
            alt=""
            class="w-8 h-8 scale-75 origin-left"
          />
        </td>
        <td class="py-3 pe-4 border-b border-white/5 text-white/60 text-sm">
          ${translateText(`help_modal.${descKey}`)}
        </td>
      </tr>
    `;
  }

  private renderBuildTable() {
    const rows: [string, string, string][] = [
      ["city", "images/CityIconWhite.svg", "build_city_desc"],
      ["factory", "images/FactoryIconWhite.svg", "build_factory_desc"],
      ["port", "images/PortIcon.svg", "build_port_desc"],
      ["defense_post", "images/ShieldIconWhite.svg", "build_defense_desc"],
      ["missile_silo", "images/MissileSiloIconWhite.svg", "build_silo_desc"],
      ["sam_launcher", "images/SamLauncherIconWhite.svg", "build_sam_desc"],
      ["radar", "images/RadarIconWhite.svg", "build_radar_desc"],
      ["warship", "images/BattleshipIconWhite.svg", "build_warship_desc"],
      ["atom_bomb", "images/NukeIconWhite.svg", "build_atom_desc"],
      [
        "hydrogen_bomb",
        "images/MushroomCloudIconWhite.svg",
        "build_hydrogen_desc",
      ],
      ["emp_bomb", "images/EmpIconWhite.svg", "build_emp_desc"],
      ["mirv", "images/MIRVIcon.svg", "build_mirv_desc"],
    ];
    return html`
      <div class="overflow-hidden rounded-xl border border-white/10">
        <table class="w-full border-collapse !my-0">
          <thead class="bg-white/10">
            <tr>
              <th
                class="py-3 ps-4 text-start text-xs font-bold uppercase tracking-wider text-emerald-300 w-[20%]"
              >
                ${translateText("help_modal.build_name")}
              </th>
              <th
                class="py-3 text-start text-xs font-bold uppercase tracking-wider text-emerald-300 w-[8%]"
              >
                ${translateText("help_modal.build_icon")}
              </th>
              <th
                class="py-3 text-start text-xs font-bold uppercase tracking-wider text-emerald-300"
              >
                ${translateText("help_modal.build_desc")}
              </th>
            </tr>
          </thead>
          <tbody class="text-white/80">
            ${rows.map(([unit, icon, desc]) => this.buildRow(unit, icon, desc))}
          </tbody>
        </table>
      </div>
    `;
  }

  private renderPlayerIcons() {
    const icons: [string, string][] = [
      ["crown.webp", "icon_crown"],
      ["traitor2.webp", "icon_traitor"],
      ["ally2.webp", "icon_ally"],
      ["embargo.webp", "icon_embargo"],
      ["allianceRequest.webp", "icon_request"],
    ];
    return html`
      <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
        ${icons.map(
          ([image, key]) => html`
            <div
              class="bg-black/20 rounded-xl border border-white/10 p-4 flex flex-col items-center gap-3"
            >
              <img
                src=${assetUrl(`images/helpModal/${image}`)}
                alt=""
                class="rounded shadow-lg border border-white/10 h-24 w-auto object-contain"
                loading="lazy"
              />
              <span class="text-xs text-white/80 text-center">
                ${translateText(`help_modal.${key}`)}
              </span>
            </div>
          `,
        )}
      </div>
    `;
  }

  private renderHotkeys() {
    const keybinds = this.keybinds;
    return html`
      <section
        class="bg-white/5 rounded-xl border border-white/10 overflow-hidden"
      >
        <div class="pt-2 pb-4 px-4 overflow-x-auto">
          <table class="w-full text-sm border-separate border-spacing-y-1">
            <thead>
              <tr
                class="text-white/40 text-xs uppercase tracking-wider text-start"
              >
                <th class="pb-2 ps-4">
                  ${translateText("help_modal.table_key")}
                </th>
                <th class="pb-2">
                  ${translateText("help_modal.table_action")}
                </th>
              </tr>
            </thead>
            <tbody class="text-white/80">
              <tr class="hover:bg-white/5 transition-colors">
                <td class="py-3 ps-4 border-b border-white/5">
                  ${this.renderKey("Escape")}
                </td>
                <td class="py-3 border-b border-white/5 text-white/70">
                  ${translateText("help_modal.action_esc")}
                </td>
              </tr>
              <tr class="hover:bg-white/5 transition-colors">
                <td class="py-3 ps-4 border-b border-white/5">
                  ${this.renderKey("Enter")}
                </td>
                <td class="py-3 border-b border-white/5 text-white/70">
                  ${translateText("help_modal.action_enter")}
                </td>
              </tr>
              <tr class="hover:bg-white/5 transition-colors">
                <td class="py-3 ps-4 border-b border-white/5">
                  ${this.renderKey(keybinds.toggleView)}
                </td>
                <td class="py-3 border-b border-white/5 text-white/70">
                  ${translateText("user_setting.toggle_view_desc")}
                </td>
              </tr>
              <tr class="hover:bg-white/5 transition-colors">
                <td class="py-3 ps-4 border-b border-white/5">
                  ${this.renderKey(keybinds.coordinateGrid)}
                </td>
                <td class="py-3 border-b border-white/5 text-white/70">
                  ${translateText("help_modal.action_coordinate_grid")}
                </td>
              </tr>
              <tr class="hover:bg-white/5 transition-colors">
                <td class="py-3 ps-4 border-b border-white/5">
                  ${this.renderKey(keybinds.swapDirection)}
                </td>
                <td class="py-3 border-b border-white/5 text-white/70">
                  ${translateText("help_modal.bomb_direction")}
                </td>
              </tr>
              <tr class="hover:bg-white/5 transition-colors">
                <td class="py-3 ps-4 border-b border-white/5">
                  <div class="inline-flex items-center gap-2">
                    ${this.renderKey(keybinds.shiftKey)}
                    <span class="text-white/40 font-bold">+</span>
                    <div
                      class="w-5 h-8 border border-white/40 rounded-full relative"
                    >
                      <div
                        class="absolute top-0 left-0 w-1/2 h-1/2 bg-red-500/80 rounded-tl-full"
                      ></div>
                      <div
                        class="w-0.5 h-1.5 bg-white/40 rounded-full absolute top-1.5 left-1/2 -translate-x-1/2"
                      ></div>
                    </div>
                  </div>
                </td>
                <td class="py-3 border-b border-white/5 text-white/70">
                  ${translateText("help_modal.action_attack_altclick")}
                </td>
              </tr>
              <tr class="hover:bg-white/5 transition-colors">
                <td class="py-3 ps-4 border-b border-white/5">
                  <div class="inline-flex items-center gap-2">
                    ${this.renderKey(keybinds.buildMenuModifier)}
                    <span class="text-white/40 font-bold">+</span>
                    <div
                      class="w-5 h-8 border border-white/40 rounded-full relative"
                    >
                      <div
                        class="absolute top-0 left-0 w-1/2 h-1/2 bg-red-500/80 rounded-tl-full"
                      ></div>
                      <div
                        class="w-0.5 h-1.5 bg-white/40 rounded-full absolute top-1.5 left-1/2 -translate-x-1/2"
                      ></div>
                    </div>
                  </div>
                </td>
                <td class="py-3 border-b border-white/5 text-white/70">
                  ${translateText("help_modal.action_build")}
                </td>
              </tr>
              <tr class="hover:bg-white/5 transition-colors">
                <td class="py-3 ps-4 border-b border-white/5">
                  <div class="inline-flex items-center gap-2">
                    ${this.renderKey(keybinds.emojiMenuModifier)}
                    <span class="text-white/40 font-bold">+</span>
                    <div
                      class="w-5 h-8 border border-white/40 rounded-full relative"
                    >
                      <div
                        class="absolute top-0 left-0 w-1/2 h-1/2 bg-red-500/80 rounded-tl-full"
                      ></div>
                      <div
                        class="w-0.5 h-1.5 bg-white/40 rounded-full absolute top-1.5 left-1/2 -translate-x-1/2"
                      ></div>
                    </div>
                  </div>
                </td>
                <td class="py-3 border-b border-white/5 text-white/70">
                  ${translateText("help_modal.action_emote")}
                </td>
              </tr>
              <tr class="hover:bg-white/5 transition-colors">
                <td class="py-3 ps-4 border-b border-white/5">
                  ${this.renderKey(keybinds.centerCamera)}
                </td>
                <td class="py-3 border-b border-white/5 text-white/70">
                  ${translateText("user_setting.center_camera_desc")}
                </td>
              </tr>
              <tr class="hover:bg-white/5 transition-colors">
                <td class="py-3 ps-4 border-b border-white/5">
                  ${this.renderKey(keybinds.pauseGame)}
                </td>
                <td class="py-3 border-b border-white/5 text-white/70">
                  ${translateText("help_modal.action_pause_game")}
                </td>
              </tr>
              <tr class="hover:bg-white/5 transition-colors">
                <td class="py-3 ps-4 border-b border-white/5">
                  <div class="flex flex-wrap gap-2">
                    ${this.renderKey(keybinds.gameSpeedDown)}
                    ${this.renderKey(keybinds.gameSpeedUp)}
                  </div>
                </td>
                <td class="py-3 border-b border-white/5 text-white/70">
                  ${translateText("help_modal.action_game_speed")}
                </td>
              </tr>
              <tr class="hover:bg-white/5 transition-colors">
                <td class="py-3 ps-4 border-b border-white/5">
                  <div class="flex flex-wrap gap-2">
                    ${this.renderKey(keybinds.zoomOut)}
                    ${this.renderKey(keybinds.zoomIn)}
                  </div>
                </td>
                <td class="py-3 border-b border-white/5 text-white/70">
                  ${translateText("help_modal.action_zoom")}
                </td>
              </tr>
              <tr class="hover:bg-white/5 transition-colors">
                <td class="py-3 ps-4 border-b border-white/5">
                  <div class="flex flex-wrap gap-1 max-w-[200px]">
                    ${this.renderKey(keybinds.moveUp)}
                    ${this.renderKey(keybinds.moveLeft)}
                    ${this.renderKey(keybinds.moveDown)}
                    ${this.renderKey(keybinds.moveRight)}
                  </div>
                </td>
                <td class="py-3 border-b border-white/5 text-white/70">
                  ${translateText("help_modal.action_move_camera")}
                </td>
              </tr>
              <tr class="hover:bg-white/5 transition-colors">
                <td class="py-3 ps-4 border-b border-white/5">
                  <div class="flex flex-wrap gap-2">
                    ${this.renderKey(keybinds.attackRatioDown)}
                    ${this.renderKey(keybinds.attackRatioUp)}
                  </div>
                </td>
                <td class="py-3 border-b border-white/5 text-white/70">
                  ${translateText("help_modal.action_ratio_change")}
                </td>
              </tr>
              <tr class="hover:bg-white/5 transition-colors">
                <td class="py-3 ps-4 border-b border-white/5">
                  <div class="inline-flex items-center gap-2">
                    ${this.renderKey(keybinds.shiftKey)}
                    <span class="text-white/40 font-bold">+</span>
                    <div class="flex items-center gap-1">
                      <div
                        class="w-5 h-8 border border-white/40 rounded-full relative"
                      >
                        <div
                          class="w-0.5 h-2 bg-red-400 rounded-full absolute top-1.5 left-1/2 -translate-x-1/2"
                        ></div>
                      </div>
                      <div class="flex flex-col text-[10px] text-white/50">
                        <span>↑</span>
                        <span>↓</span>
                      </div>
                    </div>
                  </div>
                </td>
                <td class="py-3 border-b border-white/5 text-white/70">
                  ${translateText("help_modal.action_ratio_change")}
                </td>
              </tr>
              <tr class="hover:bg-white/5 transition-colors">
                <td class="py-3 ps-4 border-b border-white/5">
                  <div class="inline-flex items-center gap-2">
                    ${this.renderKey(keybinds.altKey)}
                    <span class="text-white/40 font-bold">+</span>
                    ${this.renderKey(keybinds.resetGfx)}
                  </div>
                </td>
                <td class="py-3 border-b border-white/5 text-white/70">
                  ${translateText("help_modal.action_reset_gfx")}
                </td>
              </tr>
              <tr class="hover:bg-white/5 transition-colors">
                <td class="py-3 ps-4 border-b border-white/5">
                  <div
                    class="w-5 h-8 border border-white/40 rounded-full relative"
                  >
                    <div
                      class="w-0.5 h-2 bg-red-400 rounded-full absolute top-1.5 left-1/2 -translate-x-1/2"
                    ></div>
                  </div>
                </td>
                <td class="py-3 border-b border-white/5 text-white/70">
                  ${translateText("help_modal.action_auto_upgrade")}
                </td>
              </tr>
              <tr class="hover:bg-white/5 transition-colors">
                <td class="py-3 ps-4 border-b border-white/5">
                  <div class="inline-flex items-center gap-2">
                    ${this.renderKey(keybinds.boxSelectWarships)}
                    <span class="text-white/40 font-bold">+</span>
                    <span class="text-white/50 text-xs"
                      >${translateText("help_modal.drag")}</span
                    >
                  </div>
                </td>
                <td class="py-3 border-b border-white/5 text-white/70">
                  ${translateText("help_modal.action_warship_multiselect")}
                </td>
              </tr>
              <tr class="hover:bg-white/5 transition-colors">
                <td class="py-3 ps-4 border-b border-white/5">
                  ${this.renderKey(keybinds.selectAllWarships)}
                </td>
                <td class="py-3 border-b border-white/5 text-white/70">
                  ${translateText("help_modal.action_warship_selectall")}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  protected renderBody() {
    return html`
      <div
        dir=${textDirection()}
        class="prose prose-invert prose-sm max-w-none px-6 py-3
          [&_a]:text-emerald-400 [&_a:hover]:text-emerald-300 transition-colors
          [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:text-emerald-100
          [&_ul]:ps-5 [&_ul]:list-disc [&_ul]:space-y-1
          [&_ol]:ps-5 [&_ol]:list-decimal [&_ol]:space-y-1.5
          [&_li]:text-gray-300 [&_li]:leading-relaxed
          [&_p]:text-gray-300 [&_p]:mb-3 [&_strong]:text-white [&_strong]:font-bold
          [&_p]:[unicode-bidi:plaintext] [&_li]:[unicode-bidi:plaintext]
          [&_td:nth-child(3)]:[unicode-bidi:plaintext]"
      >
        <!-- In-game tutorial: starts a default solo game with the guide on -->
        <section
          class="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white/5 rounded-xl border border-emerald-500/30 px-5 py-4"
        >
          <div>
            <h3 class="!mt-0 !mb-1">
              ${translateText("help_modal.in_game_tutorial")}
            </h3>
            <p class="!mb-0 text-sm">
              ${translateText("help_modal.in_game_tutorial_desc")}
            </p>
          </div>
          <button
            class="shrink-0 hover:bg-white/5 px-6 py-2 text-xs font-bold transition-all duration-200 rounded-lg uppercase tracking-widest bg-brand/20 text-brand-light border border-brand/30 shadow-[var(--shadow-brand)]"
            @click=${() =>
              document.dispatchEvent(new CustomEvent("start-tutorial"))}
          >
            ${translateText("help_modal.in_game_tutorial_start")}
          </button>
        </section>

        <!-- The basics: the order a first game goes in -->
        ${this.sectionTitle(
          svg`<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
            <path
              d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"
            ></path>`,
          "help_modal.basics_title",
        )}
        <ol class="!mt-0">
          ${[
            "basics_spawn",
            "basics_expand",
            "basics_economy",
            "basics_win",
          ].map((k) => html`<li>${translateText(`help_modal.${k}`)}</li>`)}
        </ol>

        <!-- Game screen -->
        ${this.sectionTitle(
          svg`<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="3" y1="9" x2="21" y2="9"></line>
            <line x1="9" y1="21" x2="9" y2="9"></line>`,
          "help_modal.ui_section",
        )}
        <div class="grid grid-cols-1 gap-4">
          ${this.figure(
            "controlPanel2.webp",
            "ui_control",
            html`<p>${translateText("help_modal.ui_control_intro")}</p>
              ${this.bullets([
                "ui_troops",
                "ui_gold",
                "ui_attack_ratio",
                "ui_objectives",
                "ui_build_bar",
              ])}`,
            "max-w-[340px]",
          )}
          ${this.figure(
            "topBar.webp",
            "ui_playeroverlay",
            html`<p class="!mb-0">
              ${translateText("help_modal.ui_playeroverlay_text")}
            </p>`,
            "max-w-[340px]",
          )}
          ${this.figure(
            "leaderboard3.webp",
            "ui_leaderboard",
            html`<p class="!mb-0">
              ${translateText("help_modal.ui_leaderboard_text")}
            </p>`,
          )}
          ${this.figure(
            "options3.webp",
            "ui_options",
            html`<p class="!mb-0">
              ${translateText("help_modal.ui_options_text")}
            </p>`,
            "max-w-[200px]",
          )}
          <div class="bg-black/20 rounded-xl border border-white/10 p-5">
            <span
              class="text-xs font-bold uppercase tracking-wider text-emerald-300"
              >${translateText("help_modal.ui_events")}</span
            >
            <p class="mt-2 !mb-0 text-sm">
              ${translateText("help_modal.ui_events_text")}
            </p>
          </div>
        </div>

        <!-- Radial menu and player panel -->
        ${this.sectionTitle(
          svg`<circle cx="12" cy="12" r="10"></circle>
            <circle cx="12" cy="12" r="3"></circle>
            <line x1="12" y1="2" x2="12" y2="9"></line>
            <line x1="12" y1="15" x2="12" y2="22"></line>`,
          "help_modal.radial_title",
        )}
        <p class="text-sm">${translateText("help_modal.radial_intro")}</p>
        <div class="grid grid-cols-1 gap-4">
          ${this.figure(
            "radialMenu3.webp",
            "radial_own",
            this.bullets(["radial_build", "radial_delete", "radial_info"]),
            "max-w-[160px]",
          )}
          ${this.figure(
            "radialMenuEnemy.webp",
            "radial_other",
            this.bullets([
              "radial_attack",
              "radial_boat",
              "info_alliance",
              "radial_info",
            ]),
            "max-w-[160px]",
          )}
          ${this.figure(
            "playerPanel.webp",
            "panel_title",
            html`<p>${translateText("help_modal.panel_desc")}</p>
              ${this.bullets([
                "info_chat",
                "info_emoji",
                "info_target",
                "info_trade",
                "info_alliance",
              ])}`,
            "max-w-[220px]",
          )}
          <div class="bg-black/20 rounded-xl border border-white/10 p-5">
            <span
              class="text-xs font-bold uppercase tracking-wider text-emerald-300"
              >${translateText("help_modal.allies_title")}</span
            >
            <div class="mt-2 text-sm">
              ${this.bullets([
                "radial_donate_troops",
                "radial_donate_gold",
                "ally_betray",
              ])}
            </div>
          </div>
        </div>

        <!-- Buildings and weapons -->
        ${this.sectionTitle(
          svg`<path d="M3 21h18"></path>
            <path d="M5 21V7l8-4v18"></path>
            <path d="M19 21V11l-6-4"></path>`,
          "help_modal.buildings_title",
        )}
        <p class="text-sm">${translateText("help_modal.build_intro")}</p>
        ${this.renderBuildTable()}

        <!-- Building upgrades -->
        ${this.sectionTitle(
          svg`<polyline points="17 11 12 6 7 11"></polyline>
            <polyline points="17 18 12 13 7 18"></polyline>`,
          "help_modal.upgrades_title",
        )}
        ${this.figure(
          "structureCard.webp",
          "upgrades_card",
          html`<p>${translateText("help_modal.upgrades_desc")}</p>
            ${this.bullets([
              "upgrades_economy",
              "upgrades_military",
              "upgrades_ranked",
              "upgrades_frames",
            ])}`,
          "max-w-[240px]",
        )}

        <!-- Map objectives -->
        ${this.sectionTitle(
          svg`<polygon points="12 2 22 12 12 22 2 12"></polygon>`,
          "help_modal.objectives_title",
        )}
        ${this.figure(
          "objective.webp",
          "objectives_zone",
          html`<p>${translateText("help_modal.objectives_desc")}</p>
            ${this.bullets([
              "objectives_capture",
              "objectives_bonus",
              "objectives_cap",
              "objectives_where",
            ])}`,
        )}

        <!-- Icons on the map -->
        ${this.sectionTitle(
          svg`<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>`,
          "help_modal.player_icons",
        )}
        ${this.renderPlayerIcons()}

        <!-- Hotkeys -->
        ${this.sectionTitle(
          svg`<rect x="2" y="4" width="20" height="16" rx="2" ry="2"></rect>
            <path d="M6 8h.001"></path>
            <path d="M10 8h.001"></path>
            <path d="M14 8h.001"></path>
            <path d="M18 8h.001"></path>
            <path d="M6 16h12"></path>`,
          "help_modal.hotkeys",
        )}
        ${this.renderHotkeys()}

        <!-- Troubleshooting -->
        ${this.sectionTitle(
          svg`<path d="M2 20 L12 0 L22 20 L2 20"></path>
            <line x1="12" y1="8" x2="12" y2="14"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>`,
          "main.troubleshooting",
        )}
        <section class="flex flex-col items-center mb-4">
          <p class="mb-6 text-white/70 text-sm">
            ${translateText("help_modal.troubleshooting_desc")}
          </p>
          <button
            id="troubleshooting-button"
            class="hover:bg-white/5 px-6 py-2 text-xs font-bold transition-all duration-200 rounded-lg uppercase tracking-widest bg-brand/20 text-brand-light border border-brand/30 shadow-[var(--shadow-brand)]"
            @click="${this.openTroubleshooting}"
          >
            ${translateText("main.go_to_troubleshooting")}
          </button>
        </section>
      </div>
    `;
  }

  openTroubleshooting() {
    const troubleshootingModal = document.querySelector(
      "troubleshooting-modal",
    ) as TroubleshootingModal;
    if (
      !troubleshootingModal ||
      !(troubleshootingModal instanceof TroubleshootingModal)
    ) {
      console.warn("Troubleshooting modal element not found");
      return;
    }
    troubleshootingModal.open();
  }

  protected onOpen(): void {
    this.keybinds = this.getKeybinds();
  }
}
