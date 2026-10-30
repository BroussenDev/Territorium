import { getApiBase } from "./ApiBase";
import { getAuthHeader, isLoggedIn } from "./Auth";
import { currentLanguage } from "./Utils";

// A player's report of one chat line, sent to the account API for the
// staff's review (and for the chat filter to learn from). Only signed-in
// players can report: the API needs to know who is asking.

export const CHAT_REPORT_MAX_LENGTH = 300;

export interface ChatReportBody {
  gameID: string;
  text: string;
  senderClientID?: string;
  senderPublicId?: string;
  lang?: string;
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
): ChatReportBody {
  return {
    gameID,
    text: text.slice(0, CHAT_REPORT_MAX_LENGTH),
    ...(senderClientID ? { senderClientID } : {}),
    ...(senderPublicId ? { senderPublicId } : {}),
    lang: currentLanguage(),
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
