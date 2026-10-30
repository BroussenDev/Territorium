import { GameEnv } from "../core/configuration/Config";
import { tokenize } from "./ChatTokenizer";
import { ServerEnv } from "./ServerEnv";

// The chat's learned filter, on top of the word lists (ChatModeration.ts).
// The account API trains a model from reviewed messages and publishes its
// weights; this module keeps the latest copy in memory and scores each line
// locally, so chat never waits on the network and, when the model is missing,
// simply behaves as before (fail open).

export interface ChatModelThresholds {
  block: number;
  queueMin: number;
  blockActive: boolean;
}

export interface ChatModelLang {
  samples: number;
  weights: Record<string, number>;
}

export interface ChatModelData {
  version: string;
  langs: Record<string, ChatModelLang>;
  minLangSamples: number;
  thresholds: ChatModelThresholds;
}

export type ChatToxicityDecision = "block" | "uncertain" | "pass";

export type SampleKind = "blocked" | "uncertain";

export const MODEL_REFRESH_MS = 10 * 60 * 1000;
export const SAMPLE_INTERVAL_MS = 30_000;
const GLOBAL = "*";
const REQUEST_TIMEOUT_MS = 5000;

/** "fr-CA" -> "fr"; null when it is not a language code. */
function langOf(lang: unknown): string | null {
  const l = String(lang ?? "")
    .toLowerCase()
    .split(/[-_]/)[0];
  return /^[a-z]{2,3}$/.test(l) ? l : null;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** The model, if the API's answer has the expected shape. */
export function parseChatModel(body: unknown): ChatModelData | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  const t = b.thresholds as Record<string, unknown> | undefined;
  if (typeof b.langs !== "object" || b.langs === null || !t) return null;
  if (
    !isFiniteNumber(t.block) ||
    !isFiniteNumber(t.queueMin) ||
    typeof t.blockActive !== "boolean"
  ) {
    return null;
  }
  const langs: Record<string, ChatModelLang> = {};
  for (const [key, value] of Object.entries(b.langs)) {
    const v = value as Record<string, unknown> | null;
    if (
      typeof v !== "object" ||
      v === null ||
      !isFiniteNumber(v.samples) ||
      typeof v.weights !== "object" ||
      v.weights === null
    ) {
      continue;
    }
    langs[key] = {
      samples: v.samples,
      weights: v.weights as Record<string, number>,
    };
  }
  return {
    version: String(b.version ?? ""),
    langs,
    minLangSamples: isFiniteNumber(b.minLangSamples) ? b.minLangSamples : 50,
    thresholds: {
      block: t.block,
      queueMin: t.queueMin,
      blockActive: t.blockActive,
    },
  };
}

/** Probability that a line is toxic, or null when no model answers for it. */
export function scoreWithModel(
  model: ChatModelData,
  text: string,
  lang?: string | null,
): number | null {
  const l = langOf(lang);
  const own = l ? model.langs[l] : undefined;
  const entry =
    own && own.samples >= model.minLangSamples ? own : model.langs[GLOBAL];
  if (!entry) return null;
  let logOdds = 0;
  for (const token of tokenize(text)) {
    const w = Object.prototype.hasOwnProperty.call(entry.weights, token)
      ? entry.weights[token]
      : 0;
    if (isFiniteNumber(w)) logOdds += w;
  }
  logOdds = Math.max(-30, Math.min(30, logOdds));
  return 1 / (1 + Math.exp(-logOdds));
}

export interface ChatToxicityOptions {
  baseUrl?: () => string;
  apiKey?: () => string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export interface ChatSample {
  gameID: string;
  text: string;
  senderPersistentID: string;
  lang?: string | null;
  kind: SampleKind;
}

export class ChatToxicity {
  private model: ChatModelData | null = null;
  private etag: string | null = null;
  private readonly lastSample = new Map<string, number>();
  private readonly baseUrl: () => string;
  private readonly apiKey: () => string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;

  constructor(opts: ChatToxicityOptions = {}) {
    this.baseUrl = opts.baseUrl ?? (() => ServerEnv.jwtIssuer());
    this.apiKey = opts.apiKey ?? (() => ServerEnv.apiKey());
    this.fetchImpl = opts.fetchImpl ?? ((...a) => fetch(...a));
    this.now = opts.now ?? Date.now;
  }

  /** Fetches the model (ETag aware). Never throws: failure keeps the old one. */
  async refresh(): Promise<void> {
    try {
      const headers: Record<string, string> = { "x-api-key": this.apiKey() };
      if (this.etag !== null) headers["If-None-Match"] = this.etag;
      const res = await this.fetchImpl(`${this.baseUrl()}/tgs/chat-model`, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers,
      });
      if (res.status === 304 || !res.ok) return;
      const parsed = parseChatModel(await res.json());
      if (parsed === null) return;
      this.model = parsed;
      this.etag = res.headers.get("etag");
    } catch {
      // Unreachable: the last known model stands, or none (fail open).
    }
  }

  /** Loads the model now and every ten minutes; returns the stopper. */
  start(): () => void {
    void this.refresh();
    const timer = setInterval(() => void this.refresh(), MODEL_REFRESH_MS);
    timer.unref?.();
    return () => clearInterval(timer);
  }

  /** Test and diagnostics access. */
  setModel(model: ChatModelData | null) {
    this.model = model;
  }

  /** The score of a line, null without a usable model. */
  score(text: string, lang?: string | null): number | null {
    if (this.model === null) return null;
    try {
      return scoreWithModel(this.model, text, lang);
    } catch {
      return null;
    }
  }

  /**
   * What to do with a line the word filter let through: "block" (score at or
   * above the block threshold, once the API says blocking is active),
   * "uncertain" (between queueMin and the block threshold, goes to review) or
   * "pass". Without a model: "pass".
   */
  decide(text: string, lang?: string | null): ChatToxicityDecision {
    const model = this.model;
    if (model === null) return "pass";
    const s = this.score(text, lang);
    if (s === null) return "pass";
    const t = model.thresholds;
    if (t.blockActive && s >= t.block) return "block";
    if (s >= t.queueMin) return "uncertain";
    return "pass";
  }

  /**
   * Sends a flagged line to the API for review, at most one per player every
   * 30 seconds. Fire and forget: never throws, never delays chat.
   */
  report(sample: ChatSample): void {
    const now = this.now();
    const last = this.lastSample.get(sample.senderPersistentID);
    if (last !== undefined && now - last < SAMPLE_INTERVAL_MS) return;
    this.lastSample.set(sample.senderPersistentID, now);
    if (this.lastSample.size > 5000) {
      for (const [k, t] of this.lastSample) {
        if (now - t >= SAMPLE_INTERVAL_MS) this.lastSample.delete(k);
      }
    }
    void this.post(sample);
  }

  private async post(sample: ChatSample): Promise<void> {
    try {
      await this.fetchImpl(`${this.baseUrl()}/tgs/chat-samples`, {
        method: "POST",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey(),
        },
        body: JSON.stringify({
          gameID: sample.gameID,
          text: sample.text,
          senderPersistentID: sample.senderPersistentID,
          lang: sample.lang ?? undefined,
          kind: sample.kind,
        }),
      });
    } catch {
      // Best effort: a lost sample only costs a bit of learning.
    }
  }
}

/** The process-wide model every game's chat reads. */
export const chatToxicity = new ChatToxicity();

/** Starts keeping the model fresh (not in dev, where there is no API). */
export function startChatToxicityModel(
  target: ChatToxicity = chatToxicity,
): () => void {
  if (ServerEnv.env() === GameEnv.Dev) return () => {};
  return target.start();
}
