import { describe, expect, it, vi } from "vitest";
import {
  ChatModelData,
  ChatToxicity,
  parseChatModel,
  SAMPLE_INTERVAL_MS,
  scoreWithModel,
} from "../../src/server/ChatToxicity";

function model(over: Partial<ChatModelData> = {}): ChatModelData {
  return {
    version: "v1",
    minLangSamples: 50,
    thresholds: { block: 0.9, queueMin: 0.6, blockActive: true },
    langs: {
      "*": {
        samples: 400,
        weights: { "w:bad": 10, "w:maybe": 1, "w:friend": -3 },
      },
      fr: { samples: 60, weights: { "w:maybe": 5 } },
      de: { samples: 10, weights: { "w:maybe": 5 } },
    },
    ...over,
  };
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), init);
}

describe("scoreWithModel", () => {
  it("is the sigmoid of the summed token weights, unknown tokens counting 0", () => {
    const m = model();
    expect(scoreWithModel(m, "maybe", null)).toBeCloseTo(sigmoid(1));
    expect(scoreWithModel(m, "maybe friend", null)).toBeCloseTo(sigmoid(1 - 3));
    expect(scoreWithModel(m, "nothing known", null)).toBe(0.5);
  });

  it("uses the language entry only with enough samples", () => {
    const m = model();
    expect(scoreWithModel(m, "maybe", "fr-CA")).toBeCloseTo(sigmoid(5));
    expect(scoreWithModel(m, "maybe", "de")).toBeCloseTo(sigmoid(1));
    expect(scoreWithModel(m, "maybe", "xx")).toBeCloseTo(sigmoid(1));
  });

  it("answers null without a global entry", () => {
    const noGlobal = model({ langs: { fr: model().langs.fr } });
    expect(scoreWithModel(noGlobal, "maybe", "en")).toBeNull();
  });

  it("is not fooled by prototype keys", () => {
    expect(scoreWithModel(model(), "constructor", null)).toBe(0.5);
  });
});

describe("parseChatModel", () => {
  it("rejects malformed answers", () => {
    expect(parseChatModel(null)).toBeNull();
    expect(parseChatModel({ langs: {} })).toBeNull();
    expect(
      parseChatModel({ langs: {}, thresholds: { block: "x" } }),
    ).toBeNull();
  });
  it("accepts the API's shape", () => {
    expect(parseChatModel(model())?.thresholds.block).toBe(0.9);
  });
});

describe("ChatToxicity.decide", () => {
  it("blocks at or above the threshold, queues in between, passes below", () => {
    const t = new ChatToxicity();
    t.setModel(model());
    expect(t.decide("you bad")).toBe("block");
    expect(t.decide("maybe")).toBe("uncertain");
    expect(t.decide("hello there")).toBe("pass");
    expect(t.decide("friend")).toBe("pass");
  });

  it("only queues when blocking is not active yet", () => {
    const t = new ChatToxicity();
    t.setModel(
      model({ thresholds: { block: 0.9, queueMin: 0.6, blockActive: false } }),
    );
    expect(t.decide("you bad")).toBe("uncertain");
  });

  it("fails open without a model", () => {
    const t = new ChatToxicity();
    expect(t.decide("you bad")).toBe("pass");
    t.setModel(model({ langs: {} }));
    expect(t.decide("you bad")).toBe("pass");
  });
});

describe("ChatToxicity.refresh", () => {
  const opts = (fetchImpl: unknown) => ({
    fetchImpl: fetchImpl as typeof fetch,
    baseUrl: () => "https://api.test",
    apiKey: () => "key",
  });

  it("loads the model, then revalidates with the ETag", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(model(), { headers: { etag: "abc" } }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 304 }));
    const t = new ChatToxicity(opts(fetchImpl));
    await t.refresh();
    expect(t.decide("you bad")).toBe("block");
    await t.refresh();
    expect(fetchImpl.mock.calls[0][0]).toBe("https://api.test/tgs/chat-model");
    expect(fetchImpl.mock.calls[0][1].headers["x-api-key"]).toBe("key");
    expect(fetchImpl.mock.calls[0][1].headers["If-None-Match"]).toBeUndefined();
    expect(fetchImpl.mock.calls[1][1].headers["If-None-Match"]).toBe("abc");
    expect(t.decide("you bad")).toBe("block");
  });

  it("keeps the last model when the API fails or answers garbage", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(model()))
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValueOnce(new Response("nope", { status: 500 }))
      .mockResolvedValueOnce(jsonResponse({ weird: true }));
    const t = new ChatToxicity(opts(fetchImpl));
    await t.refresh();
    for (let i = 0; i < 3; i++) {
      await expect(t.refresh()).resolves.toBeUndefined();
    }
    expect(t.decide("you bad")).toBe("block");
  });

  it("never throws and passes everything when it never loaded", async () => {
    const t = new ChatToxicity(opts(vi.fn().mockRejectedValue(new Error("x"))));
    await expect(t.refresh()).resolves.toBeUndefined();
    expect(t.decide("you bad")).toBe("pass");
  });
});

describe("ChatToxicity.report", () => {
  it("posts at most one sample per player every 30 seconds", () => {
    let now = 1000;
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    const t = new ChatToxicity({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      baseUrl: () => "https://api.test",
      apiKey: () => "key",
      now: () => now,
    });
    const sample = {
      gameID: "g1",
      text: "maybe",
      senderPersistentID: "p1",
      kind: "uncertain" as const,
    };
    t.report(sample);
    t.report(sample);
    t.report({ ...sample, senderPersistentID: "p2" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    now += SAMPLE_INTERVAL_MS;
    t.report(sample);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.test/tgs/chat-samples");
    expect(JSON.parse(init.body)).toEqual({
      gameID: "g1",
      text: "maybe",
      senderPersistentID: "p1",
      kind: "uncertain",
    });
  });

  it("swallows a failing API", async () => {
    const t = new ChatToxicity({
      fetchImpl: vi
        .fn()
        .mockRejectedValue(new Error("down")) as unknown as typeof fetch,
      baseUrl: () => "x",
      apiKey: () => "k",
    });
    expect(() =>
      t.report({
        gameID: "g",
        text: "t",
        senderPersistentID: "p",
        kind: "blocked",
      }),
    ).not.toThrow();
    await Promise.resolve();
  });
});
