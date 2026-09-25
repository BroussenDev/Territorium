import { fork } from "child_process";
import os from "os";
import { fileURLToPath } from "url";
import { GameMapLoader } from "../core/game/GameMapLoader";
import { GameUpdateType, HashUpdate } from "../core/game/GameUpdates";
import { createGameRunner } from "../core/GameRunner";
import { GameRecordSchema, GameStartInfo } from "../core/Schemas";
import { decompressGameRecord } from "../core/Util";
import { logger } from "./Logger";
import { startPolling } from "./PollingLoop";
import { ServerEnv } from "./ServerEnv";

// The daily solo challenge's anti-cheat. Everyone plays the same seeded
// singleplayer game and races to win it in the fewest ticks; the time a
// player's client reports is only a claim. The API queues each claimed win
// and this server replays it: the simulation is deterministic, so running
// the record's turns (the player's own inputs) must reproduce the hashes the
// client recorded and the win, at the same tick. A record whose inputs
// don't lead to that win, or whose hashes differ, is rejected.

const log = logger.child({ comp: "solo-verifier" });

// Past this many ticks (an hour of game time) a run is not a challenge win.
export const MAX_TICKS = 36_000;
const POLL_MS = 60_000;
const REPLAY_TIMEOUT_MS = 10 * 60_000;

export interface VerifyResult {
  won: boolean;
  ticks?: number;
  // Why a run is rejected, or "retry" when this server couldn't judge it.
  reason?: string;
}

// Replays a posted singleplayer record. gitCommit: this server's build, to
// tell a run played on another version from a doctored one.
export async function verifySoloRecord(
  raw: unknown,
  gitCommit: string,
  mapLoader: GameMapLoader,
): Promise<VerifyResult> {
  const parsed = GameRecordSchema.safeParse(raw);
  if (!parsed.success) return { won: false, reason: "invalid" };
  const record = decompressGameRecord(parsed.data);
  const info = record.info;
  const [human] = info.players;
  if (info.players.length !== 1 || human === undefined) {
    return { won: false, reason: "invalid" };
  }
  const gameStart: GameStartInfo = {
    gameID: info.gameID,
    lobbyCreatedAt: info.lobbyCreatedAt,
    config: info.config,
    players: [
      {
        clientID: human.clientID,
        username: human.username,
        clanTag: human.clanTag,
        cosmetics: human.cosmetics,
      },
    ],
  };

  const computed = new Map<number, number>();
  let error: string | null = null;
  const runner = await createGameRunner(
    gameStart,
    human.clientID,
    mapLoader,
    (gu) => {
      if ("errMsg" in gu) {
        error = gu.errMsg;
        return;
      }
      for (const hu of gu.updates[GameUpdateType.Hash] as HashUpdate[]) {
        computed.set(hu.tick, hu.hash);
      }
    },
  );

  const game = runner.game;
  for (const turn of record.turns) {
    if (turn.turnNumber >= MAX_TICKS) break;
    runner.addTurn(turn);
    if (!runner.executeNextTick()) {
      log.warn(`replay of ${info.gameID} failed: ${error}`);
      return { won: false, reason: "crash" };
    }
    const recorded = turn.hash;
    const mine = computed.get(turn.turnNumber);
    if (recorded !== undefined && recorded !== null && mine !== undefined) {
      if (mine !== recorded) {
        const reason = record.gitCommit !== gitCommit ? "version" : "desync";
        return { won: false, reason };
      }
    }
    const winner = game.getWinner();
    if (winner !== null && typeof winner !== "string") {
      if (winner.clientID() !== human.clientID) {
        return { won: false, reason: "lost" };
      }
      return { won: true, ticks: game.ticks() };
    }
  }
  return { won: false, reason: "no_win" };
}

// Runs one replay in a child process, so a long simulation never stalls the
// master's event loop and its memory is handed back when it ends.
function replayInChild(record: unknown): Promise<VerifyResult> {
  return new Promise((resolve) => {
    const child = fork(fileURLToPath(import.meta.url), [], {
      execArgv: [...process.execArgv, "--max-old-space-size=1024"],
      env: { ...process.env, SOLO_VERIFIER_CHILD: "1" },
      stdio: ["ignore", "ignore", "inherit", "ipc"],
    });
    try {
      if (child.pid !== undefined) os.setPriority(child.pid, 19);
    } catch {
      // Not allowed on this host: run at normal priority.
    }
    let settled = false;
    const done = (result: VerifyResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      resolve(result);
    };
    const timer = setTimeout(
      () => done({ won: false, reason: "retry" }),
      REPLAY_TIMEOUT_MS,
    );
    child.on("message", (msg) => done(msg as VerifyResult));
    child.on("error", () => done({ won: false, reason: "retry" }));
    child.on("exit", () => done({ won: false, reason: "retry" }));
    child.send({ record, gitCommit: ServerEnv.gitCommit() });
  });
}

// Takes the API's next claimed win, replays it, reports the result.
async function verifyNext(): Promise<void> {
  const base = ServerEnv.jwtIssuer();
  const headers = {
    "Content-Type": "application/json",
    "x-api-key": ServerEnv.apiKey(),
  };
  const next = await fetch(`${base}/challenges/verify/next`, {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(30_000),
  });
  if (next.status === 204 || !next.ok) return;
  const { runId, record } = (await next.json()) as {
    runId: number;
    record: unknown;
  };
  const started = Date.now();
  const result = await replayInChild(record);
  log.info(
    `solo run ${runId}: ${result.won ? `won in ${result.ticks} ticks` : result.reason} (${Math.round((Date.now() - started) / 1000)}s)`,
  );
  await fetch(`${base}/challenges/verify/${runId}`, {
    method: "POST",
    headers,
    body: JSON.stringify(result),
    signal: AbortSignal.timeout(30_000),
  });
  // More may be waiting: take the next one without the polling pause.
  await verifyNext();
}

// Started by the master when it can call the API as a game server.
export function startSoloVerifier() {
  log.info("verifying solo challenge runs");
  startPolling(verifyNext, POLL_MS);
}

if (process.env.SOLO_VERIFIER_CHILD === "1" && process.send !== undefined) {
  console.debug = () => {};
  console.log = () => {};
  process.once("message", (msg) => {
    const { record, gitCommit } = msg as {
      record: unknown;
      gitCommit: string;
    };
    void import("./NodeMapLoader")
      .then(({ NodeMapLoader }) =>
        verifySoloRecord(record, gitCommit, new NodeMapLoader()),
      )
      .catch((err: unknown) => {
        log.error("solo replay failed", err);
        return { won: false, reason: "retry" } satisfies VerifyResult;
      })
      .then((result) => process.send!(result, () => process.exit(0)));
  });
}
