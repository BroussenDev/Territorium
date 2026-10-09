import express from "express";
import fs from "fs";
import http from "http";
import type { AddressInfo } from "net";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { Logger } from "winston";
import type { ServerStatus } from "../../src/core/ServerStatus";
import { adminGuard, AdminSessions } from "../../src/server/NewsAdmin";
import {
  registerServerControlRoutes,
  ServerControlStore,
} from "../../src/server/ServerControl";

const silentLog = {
  info: () => {},
  warn: () => {},
  error: () => {},
} as unknown as Logger;

let dir: string;
let file: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "server-control-"));
  file = path.join(dir, "data", "server-control.json");
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("ServerControlStore", () => {
  test("starts open and keeps what was saved across restarts", () => {
    expect(new ServerControlStore(file).get()).toEqual({
      closed: [],
      maintenance: null,
    });
    new ServerControlStore(file).replace({
      closed: ["survival", "survival", "ranked"],
      maintenance: { startsAt: 5, endsAt: 9 },
    });
    expect(new ServerControlStore(file).get()).toEqual({
      closed: ["survival", "ranked"],
      maintenance: { startsAt: 5, endsAt: 9 },
    });
  });

  test("falls back to open on a broken file", () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "{nope");
    expect(new ServerControlStore(file, silentLog).get().closed).toEqual([]);
  });
});

// Real HTTP round trips: give them room when the whole suite runs at once.
describe("server control routes", { timeout: 20_000 }, () => {
  let server: http.Server;
  let base: string;
  let changes: ServerStatus[];
  const sessions = new AdminSessions();

  beforeEach(async () => {
    changes = [];
    const app = express();
    app.use(express.json());
    registerServerControlRoutes({
      app,
      store: new ServerControlStore(file),
      requireAdmin: adminGuard(sessions, () => "pw"),
      running: () => ({
        games: [
          {
            gameID: "ABCDEFGH",
            kind: "ffa",
            phase: "active",
            players: 12,
            map: "World",
            mode: "Free For All",
            createdAt: 1,
            startedAt: 2,
          },
        ],
        soloGames: 3,
      }),
      onChange: (s) => changes.push(s),
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
    token?: string,
    body?: unknown,
  ) =>
    fetch(base + route, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  test("serves the public status without auth", async () => {
    const res = await call("GET", "/api/server-status");
    expect(res.status).toBe(200);
    const json = (await res.json()) as ServerStatus & { serverTime: number };
    expect(json.closed).toEqual([]);
    expect(json.serverTime).toBeGreaterThan(0);
  });

  test("keeps the admin view and writes behind a session", async () => {
    expect((await call("GET", "/api/admin/server")).status).toBe(401);
    const forged = await call("PUT", "/api/admin/server", "forged", {
      closed: [],
      maintenance: null,
    });
    expect(forged.status).toBe(401);
  });

  test("lists running games and saves a maintenance", async () => {
    const token = sessions.create();
    const view = (await (
      await call("GET", "/api/admin/server", token)
    ).json()) as { games: unknown[]; soloGames: number };
    expect(view.games).toHaveLength(1);
    expect(view.soloGames).toBe(3);

    const status = { closed: ["private"], maintenance: { startsAt: 123 } };
    const res = await call("PUT", "/api/admin/server", token, status);
    expect(res.status).toBe(200);
    expect(changes).toEqual([status]);
    const pub = (await (
      await call("GET", "/api/server-status")
    ).json()) as ServerStatus;
    expect(pub.closed).toEqual(["private"]);
    expect(pub.maintenance?.startsAt).toBe(123);
  });

  test("rejects an invalid status", async () => {
    const token = sessions.create();
    const res = await call("PUT", "/api/admin/server", token, {
      closed: ["chess"],
      maintenance: null,
    });
    expect(res.status).toBe(400);
    expect(changes).toEqual([]);
  });
});
