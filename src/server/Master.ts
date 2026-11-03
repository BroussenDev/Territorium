import cluster from "cluster";
import crypto from "crypto";
import express from "express";
import rateLimit from "express-rate-limit";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { GameEnv } from "../core/configuration/Config";
import {
  applyCheckinState,
  CHECKIN_INTERVAL_MS,
  checkinBody,
  isRefusal,
  registeredSite,
  sendCheckin,
} from "./ClusterCheckin";
import { registerCommunityMapRoutes } from "./CommunityMapUpload";
import { DiscordLobbyAnnouncer, isWebhookUrl } from "./DiscordLobbyAnnouncer";
import {
  coordinatorUrl,
  LobbyCoordinatorClient,
} from "./LobbyCoordinatorClient";
import { logger } from "./Logger";
import { MapPlaylist } from "./MapPlaylist";
import { MasterLobbyService } from "./MasterLobbyService";
import {
  adminGuard,
  AdminSessions,
  NewsStore,
  registerNewsRoutes,
} from "./NewsAdmin";
import { deeplTranslator } from "./NewsTranslator";
import { setNoStoreHeaders } from "./NoStoreHeaders";
import { startPolling } from "./PollingLoop";
import { renderAppShell } from "./RenderHtml";
import {
  registerServerControlRoutes,
  ServerControlStore,
} from "./ServerControl";
import { ServerEnv } from "./ServerEnv";
import { startSoloVerifier } from "./SoloVerifier";
import { applyStaticAssetCacheControl } from "./StaticAssetCache";

const playlist = new MapPlaylist();
let lobbyService: MasterLobbyService;

const app = express();
app.disable("x-powered-by");
const server = http.createServer(app);

const log = logger.child({ comp: "m" });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json());

// Serve the shared app shell for the root document.
app.use(async (req, res, next) => {
  if (req.path === "/") {
    try {
      await renderAppShell(
        res,
        path.join(__dirname, "../../static/index.html"),
      );
    } catch (error) {
      log.error("Error rendering index.html:", error);
      res.status(500).send("Internal Server Error");
    }
  } else {
    next();
  }
});

app.use(
  express.static(path.join(__dirname, "../../static"), {
    maxAge: "1y", // Set max-age to 1 year for all static assets
    setHeaders: (res) => {
      applyStaticAssetCacheControl(
        res.setHeader.bind(res),
        res.req.originalUrl,
      );
    },
  }),
);

app.set("trust proxy", 3);
app.use(
  rateLimit({
    windowMs: 1000, // 1 second
    max: 20, // 20 requests per IP per second
  }),
);

// Apple Pay domain verification (Stripe's universal association file,
// vendored in resources/public/). Apple fetches this exact path over HTTPS when the
// domain is registered in the Stripe dashboard, and it must get the raw file:
// express.static above ignores dotfile paths (so it falls through to here)
// and the SPA fallback below would answer with the app shell, which makes
// registration fail with no error anywhere we can see. Registered after the
// rate limiter so the file read is covered by it. Verify with
// `curl https://<domain>/.well-known/apple-developer-merchantid-domain-association`.
app.get(
  "/.well-known/apple-developer-merchantid-domain-association",
  (_req, res) => {
    res.type("text/plain");
    res.sendFile(
      path.join(
        __dirname,
        "../../resources/public/.well-known/apple-developer-merchantid-domain-association",
      ),
      // sendFile refuses dotfile path segments (".well-known") by default.
      // maxAge matters beyond browsers: nginx's proxy cache honours the
      // upstream Cache-Control, and sendFile's default max-age=0 would veto
      // the nginx.conf location block that shields this route.
      { dotfiles: "allow", maxAge: "1d" },
      (err) => {
        if (err && !res.headersSent) res.status(404).end();
      },
    );
  },
);

app.use("/api", (_req, res, next) => {
  setNoStoreHeaders(res);
  next();
});

// Homepage news feed and the /admin.html panel that edits it.
const adminSessions = new AdminSessions();
registerNewsRoutes({
  app,
  store: new NewsStore(
    ServerEnv.newsFile(),
    path.join(__dirname, "../../resources/news.json"),
    log,
  ),
  sessions: adminSessions,
  adminPassword: () => ServerEnv.adminPassword(),
  translate: ServerEnv.deeplApiKey()
    ? deeplTranslator(ServerEnv.deeplApiKey()!)
    : null,
  log,
});

// Publishing maps from the map editor (CommunityMapUpload.ts).
registerCommunityMapRoutes(app, log);

// Closed game kinds and maintenance (ServerControl.ts), kept next to the news.
const serverControl = new ServerControlStore(
  path.join(path.dirname(ServerEnv.newsFile()), "server-control.json"),
  log,
);
registerServerControlRoutes({
  app,
  store: serverControl,
  requireAdmin: adminGuard(adminSessions, () => ServerEnv.adminPassword()),
  running: () => lobbyService?.runningGames() ?? { games: [], soloGames: 0 },
  onChange: (status) => lobbyService?.setServerStatus(status),
  log,
});

// Start the master process
export async function startMaster() {
  if (!cluster.isPrimary) {
    throw new Error(
      "startMaster() should only be called in the primary process",
    );
  }

  log.info(`Primary ${process.pid} is running`);
  log.info(`Setting up ${ServerEnv.numWorkers()} workers...`);

  // A server that registers schedules nothing until the API calls it open: a
  // mistyped letter must not mint lobbies under a letter routed elsewhere.
  const registers = checkinBody(0, 0) !== null;
  lobbyService = new MasterLobbyService(playlist, log, registers);
  lobbyService.setServerStatus(serverControl.get());

  const INSTANCE_ID =
    ServerEnv.env() === GameEnv.Dev
      ? "DEV_ID"
      : crypto.randomBytes(4).toString("hex");
  process.env.INSTANCE_ID = INSTANCE_ID;

  log.info(`Instance ID: ${INSTANCE_ID}`);

  // Join the site's shared public-lobby roster (LobbyCoordinatorClient.ts)
  // when LOBBY_COORDINATOR=api and this server has a public host to
  // register under, the same test as the check-in below. Started before the
  // workers fork so the first roster normally lands before scheduling
  // begins; until it does, and whenever it stops, the master schedules its
  // own lobbies exactly as it does without a coordinator.
  const hello = checkinBody(0, 0);
  const coordinator = coordinatorUrl(registeredSite());
  if (coordinator !== null && hello !== null) {
    log.info(`Joining lobby coordinator at ${coordinator}`);
    const client = new LobbyCoordinatorClient({
      url: coordinator,
      apiKey: ServerEnv.apiKey(),
      hello: {
        letter: hello.letter,
        host: hello.host,
        version: hello.version,
        numWorkers: hello.numWorkers,
        instanceId: INSTANCE_ID,
      },
      handlers: lobbyService.coordinatorHandlers(),
      log,
    });
    lobbyService.attachCoordinator(client);
    client.start();
  }

  // Announce open public lobbies on the community Discord.
  const webhook = ServerEnv.discordWebhookUrl();
  if (isWebhookUrl(webhook) && ServerEnv.domain()) {
    const announcer = new DiscordLobbyAnnouncer(
      webhook,
      `https://${ServerEnv.domain()}`,
      path.join(path.dirname(ServerEnv.newsFile()), "discord-lobbies.json"),
    );
    void announcer.cleanUp();
    lobbyService.attachAnnouncer(announcer);
    log.info("Announcing public lobbies on Discord");
  } else if (webhook) {
    log.warn("DISCORD_WEBHOOK_URL is not a Discord webhook: no announcements");
  }

  // Cluster worker id -> our WORKER_ID, captured at fork time. The exit
  // event's worker has no reliable env to read it back from.
  const workerIds = new Map<number, number>();
  const forkWorker = (workerId: number) => {
    const worker = cluster.fork({
      WORKER_ID: workerId,
      INSTANCE_ID,
    });
    workerIds.set(worker.id, workerId);
    return worker;
  };

  // Fork workers
  for (let i = 0; i < ServerEnv.numWorkers(); i++) {
    const worker = forkWorker(i);

    lobbyService.registerWorker(i, worker);
    log.info(`Started worker ${i} (PID: ${worker.process.pid})`);
  }

  // Handle worker crashes
  cluster.on("exit", (worker, code, signal) => {
    const workerIdNum = workerIds.get(worker.id);
    workerIds.delete(worker.id);
    if (workerIdNum === undefined) {
      log.error(`worker crashed could not find id`);
      return;
    }
    const workerId = String(workerIdNum);

    lobbyService.removeWorker(workerIdNum);

    log.warn(
      `Worker ${workerId} (PID: ${worker.process.pid}) died with code: ${code} and signal: ${signal}`,
    );
    log.info(`Restarting worker ${workerId}...`);

    // Restart the worker with the same ID
    const newWorker = forkWorker(workerIdNum);

    lobbyService.registerWorker(workerIdNum, newWorker);
    log.info(
      `Restarted worker ${workerId} (New PID: ${newWorker.process.pid})`,
    );
  });

  const PORT = 3000;
  server.listen(PORT, () => {
    log.info(`Master HTTP server listening on port ${PORT}`);
  });

  // Register with the API and keep checking in (docs/MultiServer.md,
  // "Server list v2"): the API's list is what clients read to find a
  // server, so a server that isn't checking in isn't offered to anyone.
  // Local development (`npm run dev`, no SUBDOMAIN) has no public host and
  // registers nowhere; every deployed host registers under its own site.
  if (registers) {
    log.info(
      `Checking in with ${ServerEnv.jwtIssuer()}/cluster/checkin every ${CHECKIN_INTERVAL_MS / 1000}s`,
    );
    let lastRefusal: string | null = null;
    startPolling(async () => {
      const body = checkinBody(
        lobbyService.liveGames(),
        lobbyService.busyGames(),
        lobbyService.connectedPlayers(),
      );
      if (body === null) return;
      const result = await sendCheckin(body);
      if (isRefusal(result)) {
        if (result.refused !== lastRefusal) {
          log.error(
            `API refused check-in as letter ${body.letter} from ${body.host}: ${result.refused}. Scheduling no public lobbies until it is accepted.`,
          );
        }
        lastRefusal = result.refused;
      } else if (result !== null) {
        lastRefusal = null;
      }
      applyCheckinState(result, (active, state) =>
        lobbyService.setActive(active, state),
      );
    }, CHECKIN_INTERVAL_MS);
  }

  // Replay the daily solo challenge's claimed wins (SoloVerifier.ts) on
  // deployed servers: they hold the key the API knows game servers by.
  if (ServerEnv.env() !== GameEnv.Dev && ServerEnv.apiKey() !== "") {
    startSoloVerifier();
  }
}

app.get("/api/health", (_req, res) => {
  const ready = lobbyService?.isHealthy() ?? false;
  // instanceId is diagnostics: it tells the machines behind an apex apart.
  const instanceId = ServerEnv.instanceId();
  if (ready) {
    res.json({ status: "ok", instanceId });
  } else {
    res.status(503).json({ status: "unavailable", instanceId });
  }
});

// SPA fallback route
app.get("/{*splat}", async function (_req, res) {
  try {
    const htmlPath = path.join(__dirname, "../../static/index.html");
    await renderAppShell(res, htmlPath);
  } catch (error) {
    log.error("Error rendering SPA fallback:", error);
    res.status(500).send("Internal Server Error");
  }
});
