import express from "express";
import fs from "fs";
import http from "http";
import type { AddressInfo } from "net";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { Logger } from "winston";
import {
  AdminNewsListSchema,
  AdminSessions,
  MAX_NEWS_ITEMS,
  NewsStore,
  passwordMatches,
  registerNewsRoutes,
} from "../../src/server/NewsAdmin";

const silentLog = {
  info: () => {},
  warn: () => {},
  error: () => {},
} as unknown as Logger;

const item = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: `Title ${id}`,
  type: "announcement",
  ...extra,
});

let dir: string;
let file: string;
let seed: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "news-admin-"));
  file = path.join(dir, "data", "news.json");
  seed = path.join(dir, "seed.json");
  fs.writeFileSync(seed, JSON.stringify([item("seeded")]));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("AdminNewsListSchema", () => {
  test("accepts a well-formed list", () => {
    const parsed = AdminNewsListSchema.parse([
      item("a", {
        description: "Hello",
        url: "https://example.com",
        platforms: ["web"],
      }),
      item("b", { type: "warning", url: null }),
    ]);
    expect(parsed).toHaveLength(2);
  });

  test("rejects non-https links", () => {
    expect(
      AdminNewsListSchema.safeParse([item("a", { url: "http://example.com" })])
        .success,
    ).toBe(false);
    expect(
      AdminNewsListSchema.safeParse([item("a", { url: "javascript:alert(1)" })])
        .success,
    ).toBe(false);
  });

  test("rejects duplicate ids, unknown types and oversized lists", () => {
    expect(AdminNewsListSchema.safeParse([item("a"), item("a")]).success).toBe(
      false,
    );
    expect(
      AdminNewsListSchema.safeParse([item("a", { type: "ad" })]).success,
    ).toBe(false);
    const tooMany = Array.from({ length: MAX_NEWS_ITEMS + 1 }, (_, i) =>
      item(`n${i}`),
    );
    expect(AdminNewsListSchema.safeParse(tooMany).success).toBe(false);
  });

  test("rejects empty titles and malformed ids", () => {
    expect(
      AdminNewsListSchema.safeParse([item("a", { title: "   " })]).success,
    ).toBe(false);
    expect(AdminNewsListSchema.safeParse([item("Bad Id")]).success).toBe(false);
  });
});

describe("NewsStore", () => {
  test("starts from the seed file when nothing was saved yet", () => {
    const store = new NewsStore(file, seed);
    expect(store.list().map((i) => i.id)).toEqual(["seeded"]);
  });

  test("persists replacements and prefers them over the seed", () => {
    const store = new NewsStore(file, seed);
    store.replace([item("fresh")]);
    expect(store.list().map((i) => i.id)).toEqual(["fresh"]);
    expect(fs.existsSync(`${file}.tmp`)).toBe(false);

    const reloaded = new NewsStore(file, seed);
    expect(reloaded.list().map((i) => i.id)).toEqual(["fresh"]);
  });

  test("an invalid replacement leaves the feed untouched", () => {
    const store = new NewsStore(file, seed);
    expect(() => store.replace([item("a"), item("a")])).toThrow();
    expect(store.list().map((i) => i.id)).toEqual(["seeded"]);
    expect(fs.existsSync(file)).toBe(false);
  });

  test("falls back to the seed when the saved file is corrupt", () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "{not json");
    const store = new NewsStore(file, seed, silentLog);
    expect(store.list().map((i) => i.id)).toEqual(["seeded"]);
  });

  test("is empty when neither file exists", () => {
    const store = new NewsStore(file, path.join(dir, "missing.json"));
    expect(store.list()).toEqual([]);
  });
});

describe("AdminSessions", () => {
  test("tokens are valid until they expire or are revoked", () => {
    let now = 1_000;
    const sessions = new AdminSessions(100, () => now);
    const a = sessions.create();
    const b = sessions.create();
    expect(a).not.toBe(b);
    expect(sessions.isValid(a)).toBe(true);
    expect(sessions.isValid("forged")).toBe(false);

    sessions.revoke(a);
    expect(sessions.isValid(a)).toBe(false);

    now += 100;
    expect(sessions.isValid(b)).toBe(false);
  });
});

describe("passwordMatches", () => {
  test("compares exactly, whatever the lengths", () => {
    expect(passwordMatches("s3cret", "s3cret")).toBe(true);
    expect(passwordMatches("s3cret", "s3cre")).toBe(false);
    expect(passwordMatches("", "s3cret")).toBe(false);
  });
});

describe("news routes", () => {
  let server: http.Server;
  let base: string;
  let password: string | undefined;

  beforeEach(async () => {
    password = "correct horse";
    const app = express();
    app.use(express.json());
    registerNewsRoutes({
      app,
      store: new NewsStore(file, seed),
      sessions: new AdminSessions(),
      adminPassword: () => password,
      log: silentLog,
    });
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const call = (
    method: string,
    route: string,
    opts: { token?: string; body?: unknown } = {},
  ) =>
    fetch(base + route, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });

  const login = async () => {
    const res = await call("POST", "/api/admin/login", {
      body: { password },
    });
    expect(res.status).toBe(200);
    return ((await res.json()) as { token: string }).token;
  };

  test("serves the public feed without auth", async () => {
    const res = await call("GET", "/api/news");
    expect(res.status).toBe(200);
    expect(((await res.json()) as { id: string }[])[0].id).toBe("seeded");
  });

  test("rejects a wrong password and unauthenticated writes", async () => {
    const bad = await call("POST", "/api/admin/login", {
      body: { password: "nope" },
    });
    expect(bad.status).toBe(401);

    const write = await call("PUT", "/api/admin/news", { body: [item("x")] });
    expect(write.status).toBe(401);
    const forged = await call("PUT", "/api/admin/news", {
      token: "forged",
      body: [item("x")],
    });
    expect(forged.status).toBe(401);
  });

  test("an admin can publish news that players then see", async () => {
    const token = await login();
    const put = await call("PUT", "/api/admin/news", {
      token,
      body: [item("tournament-1", { type: "tournament" })],
    });
    expect(put.status).toBe(200);

    const feed = (await (await call("GET", "/api/news")).json()) as {
      id: string;
    }[];
    expect(feed.map((i) => i.id)).toEqual(["tournament-1"]);
    expect(fs.existsSync(file)).toBe(true);
  });

  test("invalid lists are refused with the offending field", async () => {
    const token = await login();
    const res = await call("PUT", "/api/admin/news", {
      token,
      body: [item("a", { url: "http://insecure.example" })],
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { issues: { path: string }[] };
    expect(body.issues[0].path).toBe("0.url");
  });

  test("logout revokes the session", async () => {
    const token = await login();
    expect((await call("POST", "/api/admin/logout", { token })).status).toBe(
      204,
    );
    expect((await call("GET", "/api/admin/news", { token })).status).toBe(401);
  });

  test("everything but the status is hidden when no password is set", async () => {
    password = undefined;
    const status = await (await call("GET", "/api/admin/status")).json();
    expect(status).toEqual({ enabled: false });
    expect(
      (await call("POST", "/api/admin/login", { body: { password: "" } }))
        .status,
    ).toBe(404);
    expect((await call("GET", "/api/admin/news")).status).toBe(404);
  });
});
