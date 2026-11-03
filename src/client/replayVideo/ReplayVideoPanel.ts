import { html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { assetUrl } from "../../core/AssetUrls";
import { translateText } from "../Utils";
import {
  canRecordTerritoryVideo,
  loadHeaderImage,
  recordTerritoryVideo,
  VideoCancelledError,
  videoFileName,
  VideoFormat,
  VideoMeta,
} from "./RenderVideo";
import type {
  TerritoryRecording,
  TerritorySnapshotRecorder,
} from "./TerritorySnapshots";

/** Snapshots needed before a video is worth making. */
export const MIN_VIDEO_SNAPSHOTS = 2;

/**
 * Whether the end-screen video button is shown: only once the game is over,
 * on a browser that can record canvases, with enough snapshots kept.
 */
export function videoPanelVisible(state: {
  gameOver: boolean;
  supported: boolean;
  snapshotCount: number;
}): boolean {
  return (
    state.gameOver &&
    state.supported &&
    state.snapshotCount >= MIN_VIDEO_SNAPSHOTS
  );
}

const CAMERA_ICON = html`<svg
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
  class="size-5"
>
  <rect x="2" y="6" width="14" height="12" rx="2.5" />
  <path d="M16 10.5 21.5 7.2v9.6L16 13.5" />
</svg>`;

/** The end-screen block: a format choice and the button that makes the video. */
@customElement("replay-video-panel")
export class ReplayVideoPanel extends LitElement {
  @property({ attribute: false })
  recorder: TerritorySnapshotRecorder | null = null;

  /** Builds the translated labels; called when the player asks for a video. */
  @property({ attribute: false })
  getMeta: (() => VideoMeta) | null = null;

  /** True once the game is over. */
  @property({ type: Boolean })
  enabled = false;

  @property({ attribute: false })
  supported = canRecordTerritoryVideo();

  @state()
  private format: VideoFormat = "square";

  private unsubscribe: (() => void) | null = null;

  // Light DOM, like the rest of the end screen.
  createRenderRoot() {
    return this;
  }

  disconnectedCallback() {
    this.unsubscribe?.();
    this.unsubscribe = null;
    super.disconnectedCallback();
  }

  protected updated(changed: Map<string, unknown>) {
    if (!changed.has("recorder")) return;
    this.unsubscribe?.();
    this.unsubscribe =
      this.recorder?.subscribe(() => this.requestUpdate()) ?? null;
  }

  render() {
    const visible = videoPanelVisible({
      gameOver: this.enabled,
      supported: this.supported,
      snapshotCount: this.recorder?.frameCount() ?? 0,
    });
    if (!visible) return nothing;
    return html`<div
      data-video-panel
      class="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-white/15 bg-white/5 px-3 py-2"
    >
      <span class="flex-1 min-w-[12rem] text-sm text-white/80">
        ${translateText("video.hint")}
      </span>
      <div
        role="radiogroup"
        aria-label=${translateText("video.format_label")}
        class="inline-flex overflow-hidden rounded-lg border border-white/20 text-sm"
      >
        ${this.renderFormat("square", translateText("video.format_square"))}
        ${this.renderFormat("vertical", translateText("video.format_vertical"))}
      </div>
      <button
        type="button"
        data-video-start
        class="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-bold text-white transition-colors hover:bg-emerald-500 active:bg-emerald-700"
        @click=${this.start}
      >
        ${CAMERA_ICON} ${translateText("video.create")}
      </button>
    </div>`;
  }

  private renderFormat(format: VideoFormat, label: string) {
    const selected = this.format === format;
    return html`<button
      type="button"
      role="radio"
      aria-checked=${selected ? "true" : "false"}
      data-video-format=${format}
      class="px-3 py-1.5 transition-colors ${selected
        ? "bg-white/20 font-bold text-white"
        : "text-white/70 hover:bg-white/10"}"
      @click=${() => {
        this.format = format;
      }}
    >
      ${label}
    </button>`;
  }

  private start() {
    // A copy: the game keeps recording while the video is made, and thinning
    // must not reshuffle the snapshots under the renderer.
    const live = this.recorder?.recording() ?? null;
    const recording: TerritoryRecording | null =
      live === null
        ? null
        : { ...live, frames: live.frames.slice(), colors: live.colors.slice() };
    const meta = this.getMeta?.() ?? null;
    if (recording === null || meta === null) return;
    const overlay = document.createElement(
      "replay-video-progress",
    ) as ReplayVideoProgress;
    overlay.job = { recording, format: this.format, meta };
    document.body.append(overlay);
  }
}

interface VideoJob {
  recording: TerritoryRecording;
  format: VideoFormat;
  meta: VideoMeta;
}

type JobStatus = "rendering" | "ready" | "error";

/**
 * Modal over the page while the video records: progress, cancel, then a
 * preview and a download. Appended to <body> so it is not inside the end
 * screen's transformed card.
 */
@customElement("replay-video-progress")
export class ReplayVideoProgress extends LitElement {
  job: VideoJob | null = null;

  @state()
  private progress = 0;

  @state()
  private status: JobStatus = "rendering";

  @state()
  private url: string | null = null;

  @state()
  private filename = "";

  private controller = new AbortController();
  private started = false;

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    if (!this.started) {
      this.started = true;
      void this.run();
    }
  }

  disconnectedCallback() {
    this.controller.abort();
    if (this.url !== null) URL.revokeObjectURL(this.url);
    this.url = null;
    super.disconnectedCallback();
  }

  private async run() {
    const job = this.job;
    if (job === null) {
      this.remove();
      return;
    }
    try {
      const logo = await loadHeaderImage(
        assetUrl("images/TerritoriumLogo.svg"),
      );
      const { blob, extension } = await recordTerritoryVideo(job.recording, {
        format: job.format,
        meta: job.meta,
        logo,
        signal: this.controller.signal,
        onProgress: (fraction) => {
          this.progress = fraction;
        },
      });
      this.filename = videoFileName(
        job.meta.fileSlug,
        job.meta.dateStamp,
        extension,
      );
      this.url = URL.createObjectURL(blob);
      this.status = "ready";
    } catch (error) {
      if (error instanceof VideoCancelledError) {
        this.remove();
        return;
      }
      console.warn("Video recording failed", error);
      this.status = "error";
    }
  }

  private close() {
    if (this.status === "rendering") {
      this.controller.abort();
      return;
    }
    this.remove();
  }

  private onKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") this.close();
  }

  render() {
    const percent = Math.round(this.progress * 100);
    return html`<div
      data-video-overlay
      role="dialog"
      aria-modal="true"
      aria-label=${translateText("video.create")}
      class="fixed inset-0 z-[10030] flex items-center justify-center bg-black/70 p-4"
      @keydown=${this.onKeydown}
    >
      <div
        class="flex w-[min(92vw,460px)] flex-col gap-4 rounded-2xl border border-white/10 bg-plate-800 p-5 text-white shadow-2xl"
      >
        ${this.status === "rendering" ? this.renderProgress(percent) : nothing}
        ${this.status === "ready" ? this.renderReady() : nothing}
        ${this.status === "error" ? this.renderError() : nothing}
      </div>
    </div>`;
  }

  private renderProgress(percent: number) {
    return html`<div class="font-display text-lg font-bold">
        ${translateText("video.generating")}
      </div>
      <div
        role="progressbar"
        aria-label=${translateText("video.progress_aria")}
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow=${percent}
        class="h-2.5 overflow-hidden rounded-full bg-white/10"
      >
        <div
          class="h-full rounded-full bg-emerald-400"
          style="width:${percent}%"
        ></div>
      </div>
      <p class="m-0 text-sm text-white/70">
        ${translateText("video.keep_tab_open")}
      </p>
      <div class="flex justify-end">
        <button
          type="button"
          data-video-cancel
          class="rounded-lg bg-white/10 px-4 py-2 text-sm font-bold hover:bg-white/20"
          @click=${this.close}
        >
          ${translateText("video.cancel")}
        </button>
      </div>`;
  }

  private renderReady() {
    return html`<div class="font-display text-lg font-bold">
        ${translateText("video.ready_title")}
      </div>
      <video
        data-video-preview
        src=${this.url ?? ""}
        aria-label=${translateText("video.preview_aria")}
        controls
        muted
        loop
        autoplay
        playsinline
        class="max-h-[60dvh] w-full rounded-lg bg-black"
      ></video>
      <div class="flex flex-wrap justify-end gap-2">
        <a
          data-video-download
          href=${this.url ?? ""}
          download=${this.filename}
          class="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-500"
          >${translateText("video.download")}</a
        >
        <button
          type="button"
          class="rounded-lg bg-white/10 px-4 py-2 text-sm font-bold hover:bg-white/20"
          @click=${this.close}
        >
          ${translateText("video.close")}
        </button>
      </div>`;
  }

  private renderError() {
    return html`<p class="m-0 text-sm text-white/80">
        ${translateText("video.error")}
      </p>
      <div class="flex justify-end">
        <button
          type="button"
          class="rounded-lg bg-white/10 px-4 py-2 text-sm font-bold hover:bg-white/20"
          @click=${this.close}
        >
          ${translateText("video.close")}
        </button>
      </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "replay-video-panel": ReplayVideoPanel;
    "replay-video-progress": ReplayVideoProgress;
  }
}
