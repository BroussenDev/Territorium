import { LitElement, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import type { NewsItem } from "../../core/ApiSchemas";
import type { ClientPlatform } from "../../core/Schemas";
import { getNews } from "../Api";
import { clientPlatform } from "../ClientPlatform";
import { renderMarkdown } from "../Markdown";
import { currentLanguage, translateText } from "../Utils";

export type { NewsItem };

const DISMISSED_NEWS_KEY = "dismissedNewsItems";
const CYCLE_INTERVAL_MS = 5000;

function getDismissedIds(): Set<string> {
  const raw = localStorage.getItem(DISMISSED_NEWS_KEY);
  if (raw) return new Set(JSON.parse(raw));
  return new Set();
}

function saveDismissedIds(ids: Set<string>): void {
  localStorage.setItem(DISMISSED_NEWS_KEY, JSON.stringify([...ids]));
}

export function getVisibleNewsItems(items: NewsItem[]): NewsItem[] {
  const dismissed = getDismissedIds();
  return items.filter((item) => !dismissed.has(item.id));
}

export function filterNewsByPlatform(
  items: NewsItem[],
  platform: ClientPlatform,
): NewsItem[] {
  return items.filter(
    (item) => !item.platforms?.length || item.platforms.includes(platform),
  );
}

// The item's title and description in the player's language: the exact
// language first ("pt-BR"), then its base ("de-CH" -> "de"), else the text
// as the admin wrote it.
export function localizeNewsItem(item: NewsItem, lang: string): NewsItem {
  const t =
    item.translations?.[lang] ?? item.translations?.[lang.split("-")[0]];
  if (!t) return item;
  return {
    ...item,
    title: t.title,
    description: item.description !== undefined ? t.description : undefined,
  };
}

// Firefox runs the game slowly: its players, and only them, are told so.
const FIREFOX_WARNING: NewsItem = {
  id: "firefox-performance",
  title: "Firefox",
  titleTranslationKey: "news_box.firefox_title",
  descriptionTranslationKey: "news_box.firefox_warning",
  url: null,
  type: "warning",
};

export function withBrowserWarning(
  items: NewsItem[],
  userAgent: string,
): NewsItem[] {
  return /Firefox\//.test(userAgent) ? [FIREFOX_WARNING, ...items] : items;
}

/** A link into the game itself (a page of it): opened here, not in a new tab. */
export function inGameLink(url: string): boolean {
  if (url.startsWith("#")) return true;
  try {
    return new URL(url, location.href).origin === location.origin;
  } catch {
    return false;
  }
}

const typeLabelKeys: Record<string, string> = {
  tournament: "news_box.tournament",
  tutorial: "news_box.tutorial",
  announcement: "news_box.news",
  warning: "news_box.warning",
};

const typeLabelColors: Record<string, string> = {
  tournament: "bg-amber-500/20 text-amber-300",
  tutorial: "bg-sky-500/20 text-sky-300",
  announcement: "bg-emerald-500/20 text-emerald-300",
  warning: "bg-red-500/20 text-red-300",
};

@customElement("news-box")
export class NewsBox extends LitElement {
  @state() private items: NewsItem[] = [];
  @state() private activeIndex = 0;
  private cycleTimer: ReturnType<typeof setInterval> | null = null;

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    this.loadNews();
  }

  private async loadNews() {
    try {
      const allItems = withBrowserWarning(
        filterNewsByPlatform(await getNews(), clientPlatform()),
        navigator.userAgent,
      );
      // Reset stale dismissed list when all items would be hidden
      const visible = getVisibleNewsItems(allItems);
      if (visible.length === 0 && allItems.length > 0) {
        localStorage.removeItem(DISMISSED_NEWS_KEY);
        this.items = allItems;
      } else {
        this.items = visible;
      }
      this.startCycle();
    } catch (e) {
      console.error(e);
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.stopCycle();
  }

  private startCycle() {
    this.stopCycle();
    if (this.items.length > 1) {
      this.cycleTimer = setInterval(() => {
        this.activeIndex = (this.activeIndex + 1) % this.items.length;
      }, CYCLE_INTERVAL_MS);
    }
  }

  private stopCycle() {
    if (this.cycleTimer !== null) {
      clearInterval(this.cycleTimer);
      this.cycleTimer = null;
    }
  }

  private dismiss(id: string) {
    const dismissed = getDismissedIds();
    dismissed.add(id);
    saveDismissedIds(dismissed);
    this.items = this.items.filter((item) => item.id !== id);
    if (this.activeIndex >= this.items.length) {
      this.activeIndex = 0;
    }
    this.startCycle();
  }

  private goTo(index: number) {
    this.activeIndex = index;
    this.startCycle();
  }

  render() {
    if (this.items.length === 0) return nothing;

    const item = localizeNewsItem(
      this.items[this.activeIndex],
      currentLanguage(),
    );
    const title = item.titleTranslationKey
      ? translateText(item.titleTranslationKey)
      : item.title;

    return html`
      <div
        class="px-2 py-2 bg-surface/80 border-y border-white/10 lg:border lg:rounded-md lg:px-3 lg:py-2"
      >
        <div class="flex items-center gap-3">
          <span
            class="shrink-0 font-display text-xs font-semibold px-1.5 py-0.5 rounded-sm ${typeLabelColors[
              item.type
            ] ?? typeLabelColors["announcement"]}"
            >${translateText(
              typeLabelKeys[item.type] ?? typeLabelKeys["announcement"],
            )}</span
          >
          <div class="flex-1 min-w-0 lg:flex lg:items-baseline lg:gap-3">
            ${item.url
              ? html`<a
                  href="${item.url}"
                  target=${inGameLink(item.url) ? "_self" : "_blank"}
                  rel="noopener noreferrer"
                  class="shrink-0 text-sm font-semibold text-white hover:text-emerald-300 transition-colors truncate block lg:max-w-[45%]"
                  >${title}</a
                >`
              : html`<span
                  class="shrink-0 text-sm font-semibold text-white truncate block lg:max-w-[45%]"
                  >${title}</span
                >`}
            <span
              class="text-xs text-white/55 block min-w-0 lg:truncate [&_a]:text-emerald-300 [&_a:hover]:text-emerald-200"
              >${renderMarkdown(
                item.descriptionTranslationKey
                  ? translateText(item.descriptionTranslationKey)
                  : (item.description ?? ""),
              )}</span
            >
          </div>
          ${this.items.length > 1
            ? html`
                <div class="flex gap-1 shrink-0">
                  ${this.items.map(
                    (_, i) => html`
                      <button
                        @click=${() => this.goTo(i)}
                        class="w-1.5 h-1.5 rounded-full transition-colors ${i ===
                        this.activeIndex
                          ? "bg-white/60"
                          : "bg-white/20 hover:bg-white/40"}"
                        aria-label="${translateText("news_box.go_to_item", {
                          num: i + 1,
                        })}"
                      ></button>
                    `,
                  )}
                </div>
              `
            : nothing}
          <button
            @click=${() => this.dismiss(item.id)}
            class="shrink-0 p-0.5 text-white/30 hover:text-white/70 transition-colors"
            aria-label="${translateText("news_box.dismiss")}"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              class="w-3.5 h-3.5"
            >
              <path
                d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z"
              />
            </svg>
          </button>
        </div>
      </div>
    `;
  }
}
