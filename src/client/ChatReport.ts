import { getApiBase } from "./ApiBase";
import { getAuthHeader, isLoggedIn } from "./Auth";
import { currentLanguage } from "./Utils";

// A player's report of one chat line, sent to the account API for the
// staff's review (and for the chat filter to learn from). Only signed-in
// players can report: the API needs to know who is asking.

export const CHAT_REPORT_MAX_LENGTH = 300;

/** How many visible lines before the reported one travel with the report. */
export const CHAT_REPORT_CONTEXT_BEFORE = 15;

/** A chat line as the reporter saw it. */
export interface SeenChatLine {
  at: number;
  from: string;
  name: string;
  text: string;
  allies: boolean;
}

export interface ChatReportContext {
  lines: {
    t: number;
    id: string;
    name: string;
    ch: "all" | "team";
    text: string;
    hit?: true;
  }[];
}

/**
 * The conversation around the reported line, as the reporter saw it: up to
 * CHAT_REPORT_CONTEXT_BEFORE lines before it and the lines that followed.
 * Lines the reporter ignored are not here, nor lines they could not read.
 */
export function chatReportContext(
  seen: SeenChatLine[],
  reportedIndex: number,
): ChatReportContext | undefined {
  if (reportedIndex < 0 || reportedIndex >= seen.length) return undefined;
  const from = Math.max(0, reportedIndex - CHAT_REPORT_CONTEXT_BEFORE);
  const lines = seen.slice(from, from + 40).map((l, i) => ({
    t: l.at,
    id: l.from.slice(0, 16),
    name: l.name.slice(0, 32),
    ch: l.allies ? ("team" as const) : ("all" as const),
    text: l.text.slice(0, CHAT_REPORT_MAX_LENGTH),
    ...(from + i === reportedIndex ? { hit: true as const } : {}),
  }));
  return { lines };
}

export interface ChatReportBody {
  gameID: string;
  text: string;
  senderClientID?: string;
  senderPublicId?: string;
  lang?: string;
  context?: ChatReportContext;
}

export type ChatReportResult = "ok" | "rate_limited" | "error";

/** Whether this player may report chat lines (signed in). */
export async function canReportChat(): Promise<boolean> {
  try {
    return await isLoggedIn();
  } catch {
    return false;
  }
}

/** The request body for a reported line, in the player's current language. */
export function chatReportBody(
  gameID: string,
  text: string,
  senderClientID?: string,
  senderPublicId?: string,
  context?: ChatReportContext,
): ChatReportBody {
  return {
    gameID,
    text: text.slice(0, CHAT_REPORT_MAX_LENGTH),
    ...(senderClientID ? { senderClientID } : {}),
    ...(senderPublicId ? { senderPublicId } : {}),
    lang: currentLanguage(),
    ...(context ? { context } : {}),
  };
}

/** Sends the report. Never throws. */
export async function sendChatReport(
  body: ChatReportBody,
): Promise<ChatReportResult> {
  try {
    const authorization = await getAuthHeader();
    if (authorization === "") return "error";
    const res = await fetch(`${getApiBase()}/chat-reports`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authorization,
      },
      body: JSON.stringify(body),
    });
    if (res.ok) return "ok";
    return res.status === 429 ? "rate_limited" : "error";
  } catch {
    return "error";
  }
}
