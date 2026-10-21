import type { Express, RequestHandler } from "express";
import fs from "fs";
import os from "os";
import path from "path";
import type { Logger } from "winston";
import {
  OPEN_SERVER_STATUS,
  type ServerStatus,
  ServerStatusSchema,
} from "../core/ServerStatus";
import type { RunningGame } from "./IPCBridgeSchema";

// The server page of the admin panel (src/core/ServerStatus.ts): closing game
// kinds and announcing a maintenance, persisted next to the news so a restart
// keeps them, and the list of games running on this server so the operator
// knows when an update can go out.

export class ServerControlStore {
  private status: ServerStatus;

  constructor(
    private readonly file: string,
    private readonly log?: Logger,
  ) {
    this.status = this.load();
  }

  get(): ServerStatus {
    return this.status;
  }

  // Validates, then writes through a temp file so a crash mid-write never
  // leaves a truncated file behind.
  replace(status: unknown): ServerStatus {
    const parsed = ServerStatusSchema.parse(status);
    const clean: ServerStatus = {
      closed: [...new Set(parsed.closed)],
      maintenance: parsed.maintenance,
    };
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(clean, null, 2) + "\n");
    fs.renameSync(tmp, this.file);
    this.status = clean;
    return clean;
  }

  private load(): ServerStatus {
    if (!fs.existsSync(this.file)) return OPEN_SERVER_STATUS;
    try {
      return ServerStatusSchema.parse(
        JSON.parse(fs.readFileSync(this.file, "utf8")),
      );
    } catch (error) {
      this.log?.error(`Invalid server control file ${this.file}`, error);
      return OPEN_SERVER_STATUS;
    }
  }
}

export function registerServerControlRoutes(opts: {
  app: Express;
  store: ServerControlStore;
  requireAdmin: RequestHandler;
  // What the workers last reported: their games and solo games in progress.
  running: () => { games: RunningGame[]; soloGames: number };
  onChange: (status: ServerStatus) => void;
  log: Logger;
}) {
  const { app, store, requireAdmin, running, onChange, log } = opts;

  // For the admin panel's server list: what this server runs and how loaded
  // the machine is. Read through the API, which signs in as the admin.
  app.get("/api/admin/health", requireAdmin, (_req, res) => {
    const { games, soloGames } = running();
    res.json(serverHealth(games, soloGames));
  });

  // Read by every client: the homepage banner and the closed buttons.
  app.get("/api/server-status", (_req, res) => {
    res.json({ ...store.get(), serverTime: Date.now() });
  });

  app.get("/api/admin/server", requireAdmin, (_req, res) => {
    res.json({ status: store.get(), serverTime: Date.now(), ...running() });
  });

  app.put("/api/admin/server", requireAdmin, (req, res) => {
    const parsed = ServerStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid server status",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      });
      return;
    }
    try {
      const saved = store.replace(parsed.data);
      log.info(
        `Server control saved: closed=[${saved.closed.join(",")}] maintenance=${
          saved.maintenance
            ? new Date(saved.maintenance.startsAt).toISOString()
            : "none"
        }`,
      );
      onChange(saved);
      res.json({ status: saved, serverTime: Date.now(), ...running() });
    } catch (error) {
      log.error("Failed to save server control", error);
      res.status(500).json({ error: "Could not save" });
    }
  });
}

let versionTag: string | null | undefined;

/** The release tag deploys write to resources/version.txt, when there is one. */
function releaseTag(): string | null {
  if (versionTag !== undefined) return versionTag;
  try {
    const text = fs.readFileSync("resources/version.txt", "utf8").trim();
    versionTag = /^v\d+\.\d+\.\d+$/.test(text) ? text : null;
  } catch {
    versionTag = null;
  }
  return versionTag;
}

export interface ServerHealth {
  letter: string;
  commit: string;
  version: string | null;
  uptimeSec: number;
  load: number;
  cores: number;
  memTotal: number;
  memFree: number;
  games: number;
  players: number;
  soloGames: number;
  serverTime: number;
}

export function serverHealth(
  games: RunningGame[],
  soloGames: number,
): ServerHealth {
  return {
    letter: process.env.INSTANCE_LETTER ?? "a",
    commit: process.env.GIT_COMMIT ?? "unknown",
    version: releaseTag(),
    uptimeSec: Math.round(process.uptime()),
    load: os.loadavg()[0],
    cores: os.cpus().length,
    memTotal: os.totalmem(),
    memFree: os.freemem(),
    games: games.length,
    players: games.reduce((n, g) => n + g.players, 0),
    soloGames,
    serverTime: Date.now(),
  };
}
