import {
  html,
  LitElement,
  nothing,
  svg,
  type SVGTemplateResult,
  type TemplateResult,
} from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { assetUrl } from "../core/AssetUrls";
import { translateText } from "./Utils";

/**
 * The "What's new" window: once per update that has notes, at the first
 * visit after it. A first visit ever sets the mark without showing it: a
 * newcomer has nothing to compare with.
 *
 * Each release with notes bumps WHATS_NEW_ID and lists its items as
 * translation keys (whats_new.<id>.<key>, whats_new.<id>.<key>_title), so
 * every language reads them. The items are shown as a carousel, one at a time.
 *
 * Each item shows a 16:9 media area. Without media, its `icon` is drawn large
 * instead (video, tips, ranked, discord, shield, star).
 *
 * Adding a clip to an item, e.g. the "video" item of release <id>:
 *   1. record it in the real game, muted, looping, about 960px wide, at most
 *      2 MB, as WebM (or MP4) or animated WebP, and save it as
 *      resources/images/whats-new/<id>/video.webm;
 *   2. optionally save a still frame as <name>-poster.webp next to it: it is
 *      shown instead of the clip when the player prefers reduced motion;
 *   3. set the item's media, with the path under resources/:
 *      { key: "video", icon: "video", media: {
 *          src: "images/whats-new/<id>/video.webm",
 *          kind: "video",
 *          poster: "images/whats-new/<id>/video-poster.webp" } }
 *      `kind` is "video" for WebM/MP4, "gif" for animated WebP/GIF and
 *      "image" for a still screenshot.
 *
 * The older `image` field (a still screenshot) still works.
 */
export const WHATS_NEW_ID = "v0_1_180";

export type WhatsNewIcon =
  | "video"
  | "tips"
  | "ranked"
  | "discord"
  | "shield"
  | "star";

export type WhatsNewMedia = {
  src: string;
  kind: "image" | "gif" | "video";
  poster?: string;
};

export type WhatsNewItem = {
  key: string;
  icon?: WhatsNewIcon;
  media?: WhatsNewMedia;
  /** @deprecated Use `media` with kind "image". Kept for older entries. */
  image?: string;
};

export const WHATS_NEW_ITEMS: WhatsNewItem[] = [
  {
    key: "video",
    icon: "video",
    media: {
      src: "images/whats-new/v0_1_180/video.webm",
      kind: "video",
      poster: "images/whats-new/v0_1_180/video.png",
    },
  },
  {
    key: "tips",
    icon: "tips",
    media: {
      src: "images/whats-new/v0_1_180/tips.webm",
      kind: "video",
      poster: "images/whats-new/v0_1_180/tips.png",
    },
  },
  { key: "ranked", icon: "ranked" },
];
const SEEN_KEY = "territorium.whatsNewSeen";

/** Whether this visit shows the notes, and the mark to store. */
export function whatsNewDecision(seen: string | null): {
  show: boolean;
  mark: string;
} {
  return { show: seen !== null && seen !== WHATS_NEW_ID, mark: WHATS_NEW_ID };
}

/** The release as a label: "v0_1_180" becomes "v0.1.180". */
export function whatsNewVersionLabel(id: string = WHATS_NEW_ID): string {
  return id.replace(/_/g, ".");
}

/** The item's media, with the older `image` field read as a still image. */
export function whatsNewMediaOf(item: WhatsNewItem): WhatsNewMedia | null {
  if (item.media) return item.media;
  return item.image ? { src: item.image, kind: "image" } : null;
}

export function showWhatsNewIfNeeded(): void {
  let seen: string | null;
  try {
    seen = localStorage.getItem(SEEN_KEY);
  } catch {
    return;
  }
  const { show, mark } = whatsNewDecision(seen);
  try {
    localStorage.setItem(SEEN_KEY, mark);
  } catch {
    return;
  }
  if (show) document.body.appendChild(document.createElement("whats-new"));
}

function prefersReducedMotion(): boolean {
  return (
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
  );
}

/** Drawn with the emerald outline and the gold accents of the capital. */
const ICON_BODY: Record<WhatsNewIcon, SVGTemplateResult> = {
  video: svg`<rect x="6" y="14" width="52" height="36" rx="6" />
    <g class="text-capital" fill="currentColor" stroke="none">
      <path d="M27 25v14l12-7z" />
      <circle cx="49" cy="20" r="2.5" />
    </g>`,
  tips: svg`<path d="M32 10a14 14 0 0 0-8 25.5V42h16v-6.5A14 14 0 0 0 32 10z" />
    <path d="M26 48h12M28 53h8" />
    <g class="text-capital" stroke="currentColor">
      <path d="M32 2v4M12 12l3 3M52 12l-3 3M5 28h4M55 28h4" />
    </g>`,
  ranked: svg`<path d="M20 10h24v13a12 12 0 0 1-24 0z" />
    <path d="M20 15h-6a5 5 0 0 0 5 9M44 15h6a5 5 0 0 1-5 9" />
    <path d="M32 35v7M26 42v12h12V42M22 54h20" />
    <g class="text-capital" fill="currentColor" stroke="none">
      <path d="M32 14l2.2 4.5 4.8.7-3.5 3.4.8 4.9L32 25.6l-4.3 2.3.8-4.9-3.5-3.4 4.8-.7z" />
    </g>`,
  discord: svg`<path d="M16 10h32a4 4 0 0 1 4 4v20a4 4 0 0 1-4 4H26l-10 8v-8a4 4 0 0 1-4-4V14a4 4 0 0 1 4-4z" />
    <g class="text-capital" fill="currentColor" stroke="none">
      <circle cx="25" cy="24" r="2.8" />
      <circle cx="39" cy="24" r="2.8" />
    </g>`,
  shield: svg`<path d="M32 6l20 7v14c0 14-9 24-20 31C21 51 12 41 12 27V13z" />
    <g class="text-capital" stroke="currentColor">
      <path d="M24 31l6 6 10-12" />
    </g>`,
  star: svg`<g class="text-capital" fill="currentColor" stroke="none">
      <path d="M32 8l7 15 16 2-12 11 3 16-14-8-14 8 3-16L9 25l16-2z" />
    </g>`,
};

function renderIllustration(icon: WhatsNewIcon): SVGTemplateResult {
  return svg`<svg
    class="absolute inset-0 m-auto size-3/5 text-emerald-300 drop-shadow-[0_0_18px_rgba(52,211,153,0.35)]"
    viewBox="0 0 64 64"
    fill="none"
    stroke="currentColor"
    stroke-width="2.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >${ICON_BODY[icon]}</svg>`;
}

/** A failed file (no clip recorded yet) falls back to the illustration. */
function hideOnError(e: Event) {
  (e.currentTarget as HTMLElement).remove();
}

const MEDIA_CLASS = "absolute inset-0 size-full object-cover";

function renderMedia(
  media: WhatsNewMedia,
  reducedMotion: boolean,
): TemplateResult | typeof nothing {
  const poster = media.poster ? assetUrl(media.poster) : undefined;
  if (reducedMotion && media.kind !== "image") {
    return poster
      ? html`<img
          class=${MEDIA_CLASS}
          src=${poster}
          alt=""
          @error=${hideOnError}
        />`
      : nothing;
  }
  if (media.kind === "video") {
    return html`<video
      class=${MEDIA_CLASS}
      src=${assetUrl(media.src)}
      poster=${poster ?? nothing}
      autoplay
      loop
      muted
      playsinline
      preload="metadata"
      .muted=${true}
      aria-hidden="true"
      @error=${hideOnError}
    ></video>`;
  }
  return html`<img
    class=${MEDIA_CLASS}
    src=${assetUrl(media.src)}
    alt=""
    loading="lazy"
    @error=${hideOnError}
  />`;
}

const FOCUSABLE = "button:not([disabled]), [href], [tabindex='0']";
/** Pointer movement, in pixels, that counts as a swipe. */
const SWIPE_DISTANCE = 40;

@customElement("whats-new")
export class WhatsNew extends LitElement {
  @property({ attribute: false }) items: WhatsNewItem[] = WHATS_NEW_ITEMS;
  @state() private index = 0;

  private returnFocus: HTMLElement | null = null;
  private swipeStartX: number | null = null;

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    const active = document.activeElement;
    this.returnFocus = active instanceof HTMLElement ? active : null;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.returnFocus?.focus();
  }

  firstUpdated() {
    this.dialog()?.focus();
  }

  private dialog(): HTMLElement | null {
    return this.querySelector<HTMLElement>("[data-whats-new]");
  }

  private close() {
    this.remove();
  }

  private go(target: number) {
    const last = this.items.length - 1;
    if (last < 0) return;
    this.index = Math.min(Math.max(target, 0), last);
  }

  /** The last item's button closes the window. */
  private advance() {
    if (this.index >= this.items.length - 1) this.close();
    else this.go(this.index + 1);
  }

  private onKeydown(e: KeyboardEvent) {
    switch (e.key) {
      case "Escape":
        this.close();
        break;
      case "ArrowLeft":
        e.preventDefault();
        this.go(this.index - 1);
        break;
      case "ArrowRight":
        e.preventDefault();
        this.go(this.index + 1);
        break;
      case "Tab":
        this.trapFocus(e);
        break;
    }
  }

  /** Keeps Tab inside the dialog, which is modal. */
  private trapFocus(e: KeyboardEvent) {
    const focusable = [
      ...(this.dialog()?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []),
    ].filter((el) => !el.closest("[inert]"));
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === this.dialog())) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  private onPointerDown(e: PointerEvent) {
    this.swipeStartX = e.pointerType === "mouse" ? null : e.clientX;
  }

  private onPointerUp(e: PointerEvent) {
    const start = this.swipeStartX;
    this.swipeStartX = null;
    if (start === null) return;
    const dx = e.clientX - start;
    if (Math.abs(dx) < SWIPE_DISTANCE) return;
    this.go(this.index + (dx < 0 ? 1 : -1));
  }

  private renderSlide(
    item: WhatsNewItem,
    k: number,
    current: number,
    reducedMotion: boolean,
  ) {
    const total = this.items.length;
    const media = whatsNewMediaOf(item);
    // Only the shown slide and the next one load their clip or screenshot.
    const loaded = k === current || k === current + 1;
    return html`<section
      role="group"
      aria-roledescription="slide"
      aria-label=${`${k + 1} / ${total}`}
      ?inert=${k !== current}
      class="w-full shrink-0"
    >
      <div
        class="relative aspect-video overflow-hidden rounded-xl border border-white/10 bg-[radial-gradient(circle_at_50%_40%,rgba(52,211,153,0.16),transparent_65%)] bg-plate-950"
      >
        ${renderIllustration(item.icon ?? "star")}
        ${media && loaded ? renderMedia(media, reducedMotion) : nothing}
      </div>
      <div class="mt-4 text-lg font-bold text-emerald-200">
        ${translateText(`whats_new.${WHATS_NEW_ID}.${item.key}_title`)}
      </div>
      <p class="mt-1 text-sm text-white/80">
        ${translateText(`whats_new.${WHATS_NEW_ID}.${item.key}`)}
      </p>
    </section>`;
  }

  render() {
    const total = this.items.length;
    const current = Math.min(this.index, Math.max(total - 1, 0));
    const isLast = current >= total - 1;
    const reducedMotion = prefersReducedMotion();
    return html`<div
      class="fixed inset-0 z-[10042] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
      @click=${(e: Event) => {
        if (e.target === e.currentTarget) this.close();
      }}
      @keydown=${(e: KeyboardEvent) => this.onKeydown(e)}
    >
      <div
        data-whats-new
        role="dialog"
        aria-modal="true"
        aria-labelledby="whats-new-title"
        tabindex="-1"
        class="flex max-h-[90dvh] w-full max-w-lg flex-col gap-5 overflow-y-auto rounded-2xl border border-emerald-400/40 bg-plate-800 p-5 text-white shadow-2xl outline-none sm:p-6"
      >
        <div class="flex items-center gap-3">
          <img
            src=${assetUrl("images/Megaphone.svg")}
            alt=""
            aria-hidden="true"
            class="size-7"
          />
          <div class="min-w-0">
            <div class="text-sm font-bold tabular-nums text-emerald-300">
              ${whatsNewVersionLabel()}
            </div>
            <h2 id="whats-new-title" class="m-0 text-xl font-bold">
              ${translateText("whats_new.title")}
            </h2>
          </div>
        </div>

        <div
          role="region"
          aria-roledescription="carousel"
          aria-label=${translateText("whats_new.title")}
          class="flex flex-col gap-4"
        >
          <div
            class="touch-pan-y overflow-hidden"
            @pointerdown=${(e: PointerEvent) => this.onPointerDown(e)}
            @pointerup=${(e: PointerEvent) => this.onPointerUp(e)}
            @pointercancel=${() => (this.swipeStartX = null)}
          >
            <div
              class="flex transition-transform duration-300 ease-out motion-reduce:transition-none"
              style=${`transform: translateX(${-current * 100}%)`}
            >
              ${this.items.map((item, k) =>
                this.renderSlide(item, k, current, reducedMotion),
              )}
            </div>
          </div>

          <div class="flex items-center justify-center gap-1">
            ${this.items.map(
              (_, k) =>
                html`<button
                  type="button"
                  aria-label=${`${k + 1} / ${total}`}
                  aria-current=${k === current ? "step" : "false"}
                  class="flex h-6 w-4 items-center justify-center"
                  @click=${() => this.go(k)}
                >
                  <span
                    class=${`block h-2 rounded-full transition-all duration-300 ${
                      k === current
                        ? "w-5 bg-capital"
                        : "w-2 bg-white/30 hover:bg-white/60"
                    }`}
                  ></span>
                </button>`,
            )}
            <span
              class="ml-2 text-xs tabular-nums text-white/60"
              aria-hidden="true"
              >${current + 1} / ${total}</span
            >
          </div>

          <div class="flex items-center justify-between gap-3">
            <button
              type="button"
              class="rounded-xl border border-white/15 bg-black/25 px-4 py-2.5 text-sm font-bold transition-colors hover:bg-white/10 disabled:cursor-default disabled:opacity-40"
              ?disabled=${current === 0}
              @click=${() => this.go(this.index - 1)}
            >
              ${translateText("whats_new.previous")}
            </button>
            <button
              type="button"
              class="rounded-xl bg-capital px-5 py-2.5 text-sm font-bold text-capital-ink transition-colors hover:bg-capital-light"
              @click=${() => (isLast ? this.close() : this.go(current + 1))}
            >
              ${isLast
                ? translateText("whats_new.ok")
                : translateText("whats_new.next")}
            </button>
          </div>
        </div>
      </div>
    </div>`;
  }
}
