import { html, LitElement, nothing, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { CreatorBalance, CreatorDashboard } from "../../core/ApiSchemas";
import { getCreatorDashboard, requestCreatorPayout } from "../Api";
import { translateText } from "../Utils";
import "./baseComponents/Button";

/**
 * A partnered creator's own panel on the account tab: their code, share,
 * supporters and earnings, and a withdraw button per currency. Shares are held
 * for `holdDays` (refunds, chargebacks) before they can be withdrawn; a
 * withdrawal is a request the Territorium team pays by bank transfer.
 *
 * Hosted by AccountModal, shown only when /users/@me carries
 * `creatorAccount`. Loads its own data when `code` is set.
 */
@customElement("creator-dashboard-panel")
export class CreatorDashboardPanel extends LitElement {
  @property({ attribute: false }) code: string | null = null;

  @state() private dashboard: CreatorDashboard | null = null;
  @state() private loadFailed = false;
  @state() private busyCurrency: string | null = null;
  @state() private error = "";
  @state() private notice = "";

  createRenderRoot() {
    return this;
  }

  willUpdate(changed: Map<string, unknown>) {
    if (changed.has("code") && this.code !== null) void this.load();
  }

  private async load(): Promise<void> {
    const dashboard = await getCreatorDashboard();
    this.dashboard = dashboard;
    this.loadFailed = dashboard === null;
  }

  private money(cents: number, currency: string): string {
    return (cents / 100).toLocaleString(undefined, {
      style: "currency",
      currency: currency.toUpperCase(),
    });
  }

  private async withdraw(currency: string): Promise<void> {
    if (this.busyCurrency !== null) return;
    this.busyCurrency = currency;
    this.error = "";
    this.notice = "";
    const result = await requestCreatorPayout(currency);
    this.busyCurrency = null;
    if (result.ok) {
      this.dashboard = result.dashboard;
      this.notice = translateText("creator_dashboard.withdraw_requested");
      return;
    }
    this.error = translateText(`creator_dashboard.errors.${result.code}`, {
      amount: this.money(this.dashboard?.minPayoutCents ?? 0, currency),
    });
  }

  private renderBalance(
    balance: CreatorBalance,
    dashboard: CreatorDashboard,
  ): TemplateResult {
    const { currency } = balance;
    const canWithdraw =
      dashboard.status !== "terminated" &&
      balance.requestedCents === 0 &&
      balance.availableCents >= dashboard.minPayoutCents;
    const line = (key: string, cents: number) =>
      html`<div class="flex justify-between gap-4 text-sm">
        <span class="text-white/60">${translateText(key)}</span>
        <span class="font-bold text-white tabular-nums"
          >${this.money(cents, currency)}</span
        >
      </div>`;
    return html`<div
      class="flex flex-col gap-1.5 rounded-lg border border-white/10 bg-black/20 p-3"
    >
      ${line("creator_dashboard.available", balance.availableCents)}
      ${line("creator_dashboard.held", balance.heldCents)}
      ${balance.requestedCents > 0
        ? line("creator_dashboard.requested", balance.requestedCents)
        : nothing}
      ${line("creator_dashboard.paid", balance.paidCents)}
      <o-button
        class="mt-2"
        variant="primary"
        width="block"
        size="md"
        translationKey="creator_dashboard.withdraw"
        .disable=${!canWithdraw || this.busyCurrency !== null}
        @click=${() => void this.withdraw(currency)}
      ></o-button>
    </div>`;
  }

  render() {
    if (this.code === null) return nothing;
    const dashboard = this.dashboard;
    return html`
      <div
        class="rounded-xl border border-rose-300/20 bg-gradient-to-br from-rose-400/10 to-white/[0.02] p-5 flex flex-col gap-4"
      >
        <div class="flex flex-col gap-1">
          <span
            class="text-[10px] uppercase tracking-widest text-white/40 font-bold"
          >
            ${translateText("creator_dashboard.title")}
          </span>
          <div class="text-xl font-bold text-white leading-tight break-all">
            ${translateText("creator_dashboard.your_code", {
              code: dashboard?.code ?? this.code,
            })}
          </div>
          ${dashboard && dashboard.status !== "active"
            ? html`<div class="text-xs text-amber-300">
                ${translateText(`creator_dashboard.status_${dashboard.status}`)}
              </div>`
            : nothing}
        </div>
        ${dashboard === null
          ? html`<div class="text-sm text-white/50">
              ${translateText(
                this.loadFailed
                  ? "creator_dashboard.load_failed"
                  : "creator_dashboard.loading",
              )}
            </div>`
          : this.renderBody(dashboard)}
      </div>
    `;
  }

  private renderBody(dashboard: CreatorDashboard): TemplateResult {
    const stat = (key: string, value: string) =>
      html`<div
        class="flex flex-col items-center rounded-lg bg-white/5 px-2 py-2 text-center"
      >
        <span class="text-lg font-bold text-white tabular-nums">${value}</span>
        <span class="text-[11px] text-white/50">${translateText(key)}</span>
      </div>`;
    const balances =
      dashboard.balances.length > 0
        ? dashboard.balances
        : [
            {
              currency: "eur",
              heldCents: 0,
              availableCents: 0,
              requestedCents: 0,
              paidCents: 0,
            },
          ];
    return html`
      <div class="grid grid-cols-3 gap-2">
        ${stat("creator_dashboard.share", `${dashboard.sharePercent} %`)}
        ${stat("creator_dashboard.supporters", String(dashboard.supporters))}
        ${stat("creator_dashboard.sales", String(dashboard.sales))}
      </div>
      ${balances.map((b) => this.renderBalance(b, dashboard))}
      ${this.error
        ? html`<div class="text-sm text-red-400">${this.error}</div>`
        : nothing}
      ${this.notice
        ? html`<div class="text-sm text-green-400">${this.notice}</div>`
        : nothing}
      <p class="text-xs text-white/50">
        ${translateText("creator_dashboard.rules", {
          days: dashboard.holdDays,
          amount: this.money(dashboard.minPayoutCents, "eur"),
        })}
      </p>
      ${dashboard.payouts.length > 0
        ? html`<div class="flex flex-col gap-1 border-t border-white/10 pt-3">
            <span
              class="text-[10px] uppercase tracking-widest text-white/40 font-bold"
            >
              ${translateText("creator_dashboard.history")}
            </span>
            ${dashboard.payouts.map(
              (p) =>
                html`<div class="flex justify-between gap-4 text-sm">
                  <span class="text-white/60"
                    >${new Date(p.requestedAt).toLocaleDateString()}</span
                  >
                  <span class="tabular-nums text-white"
                    >${this.money(p.amountCents, p.currency)}</span
                  >
                  <span
                    class=${p.status === "paid"
                      ? "text-green-400"
                      : p.status === "rejected"
                        ? "text-red-400"
                        : "text-amber-300"}
                    >${translateText(
                      `creator_dashboard.payout_${p.status}`,
                    )}</span
                  >
                </div>`,
            )}
          </div>`
        : nothing}
    `;
  }
}
