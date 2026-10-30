import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  getAuthHeader: vi.fn(async () => "Bearer jwt"),
  isLoggedIn: vi.fn(async () => true),
}));
vi.mock("../../src/client/Auth", () => auth);
vi.mock("../../src/client/ApiBase", () => ({
  getApiBase: () => "https://api.test",
}));
vi.mock("../../src/client/Utils", () => ({
  currentLanguage: () => "fr",
}));

import {
  canReportChat,
  chatReportBody,
  chatReportContext,
  sendChatReport,
} from "../../src/client/ChatReport";

describe("chat report request", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    auth.getAuthHeader.mockResolvedValue("Bearer jwt");
    auth.isLoggedIn.mockResolvedValue(true);
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("builds the body with the game, text, sender and language", () => {
    expect(chatReportBody("game1", "bad line", "sender01")).toEqual({
      gameID: "game1",
      text: "bad line",
      senderClientID: "sender01",
      lang: "fr",
    });
    expect(chatReportBody("g", "x".repeat(400)).text).toHaveLength(300);
    expect(chatReportBody("g", "t")).not.toHaveProperty("senderClientID");
  });

  it("builds the conversation around the reported line", () => {
    const seen = Array.from({ length: 30 }, (_, i) => ({
      at: 1000 + i,
      from: i % 2 ? "bob" : "amy",
      name: i % 2 ? "Bob" : "Amy",
      text: `line ${i}`,
      allies: i === 20,
    }));
    const ctx = chatReportContext(seen, 20)!;
    expect(ctx.lines[0].text).toBe("line 5");
    expect(ctx.lines[ctx.lines.length - 1].text).toBe("line 29");
    expect(ctx.lines.filter((l) => l.hit).map((l) => l.text)).toEqual([
      "line 20",
    ]);
    expect(ctx.lines.find((l) => l.text === "line 20")?.ch).toBe("team");
    expect(chatReportContext(seen, -1)).toBeUndefined();
    const body = chatReportBody("g", "t", undefined, undefined, ctx);
    expect(body.context).toBe(ctx);
  });

  it("posts it with the player's authorization", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    const body = chatReportBody("game1", "bad line", "sender01");
    await expect(sendChatReport(body)).resolves.toBe("ok");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.test/chat-reports");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer jwt");
    expect(JSON.parse(init.body)).toEqual(body);
  });

  it("tells a rate limit from another failure", async () => {
    const body = chatReportBody("g", "t");
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 429 }));
    await expect(sendChatReport(body)).resolves.toBe("rate_limited");
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 400 }));
    await expect(sendChatReport(body)).resolves.toBe("error");
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await expect(sendChatReport(body)).resolves.toBe("error");
  });

  it("does not send when signed out", async () => {
    auth.getAuthHeader.mockResolvedValue("");
    await expect(sendChatReport(chatReportBody("g", "t"))).resolves.toBe(
      "error",
    );
    expect(fetchMock).not.toHaveBeenCalled();
    auth.isLoggedIn.mockResolvedValue(false);
    await expect(canReportChat()).resolves.toBe(false);
  });
});
