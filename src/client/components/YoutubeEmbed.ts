import { html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { translateText } from "../Utils";

/**
 * A YouTube video that loads nothing from Google until the player asks for
 * it: a local placeholder first, the (no-cookie) player only after a click.
 * Embedding the player straight away would hand the visitor's IP address to
 * Google and let it set cookies without consent.
 */
@customElement("youtube-embed")
export class YoutubeEmbed extends LitElement {
  /** The player's embed URL (www.youtube-nocookie.com/embed/<id>). */
  @property() src = "";
  @property() videoTitle = "";

  @state() private loaded = false;

  createRenderRoot() {
    return this;
  }

  /** Back to the placeholder, which also stops a playing video. */
  reset() {
    this.loaded = false;
  }

  render() {
    if (this.loaded) {
      const url = `${this.src}${this.src.includes("?") ? "&" : "?"}autoplay=1`;
      return html`<iframe
        class="w-full h-full rounded-sm"
        src=${url}
        title=${this.videoTitle}
        frameborder="0"
        allow="autoplay; encrypted-media; picture-in-picture; web-share"
        allowfullscreen
      ></iframe>`;
    }
    return html`
      <button
        type="button"
        class="group w-full h-full flex flex-col items-center justify-center gap-3 p-4 rounded-sm bg-[radial-gradient(circle_at_50%_40%,#12302a,#070d0f)] text-white cursor-pointer"
        @click=${() => (this.loaded = true)}
      >
        <span
          class="flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/90 shadow-lg shadow-emerald-500/30 transition-transform group-hover:scale-110 group-focus-visible:scale-110"
        >
          <svg viewBox="0 0 24 24" class="w-7 h-7 ml-1" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>
        <span class="text-sm font-bold">
          ${translateText("youtube_embed.play")}
        </span>
        <span class="max-w-sm text-xs text-white/50">
          ${translateText("youtube_embed.notice")}
        </span>
      </button>
    `;
  }
}
