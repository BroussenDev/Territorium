import crypto from "crypto";
import type { Express, NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import fs from "fs";
import path from "path";
import type { Logger } from "winston";
import { z } from "zod";
import { type NewsItem, NewsItemSchema } from "../core/ApiSchemas";
import { ClientPlatformSchema } from "../core/Schemas";
import { type TranslateFn, translateNews } from "./NewsTranslator";

// The homepage news feed, edited from /admin.html. The upstream game read it
// from a closed-source API; Territorium serves it from the master process
// and persists it to a JSON file, seeded from the bundled resources/news.json.

export const NEWS_TYPES = [
  "announcement",
  "tournament",
  "tutorial",
  "warning",
] as const;

export const MAX_NEWS_ITEMS = 20;

// Stricter than NewsItemSchema (which also has to accept whatever an older
// feed served): admin writes are what players will see, so they are bounded,
// https-only and restricted to the types the news box knows how to render.
export const AdminNewsItemSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  descriptionTranslationKey: z
    .string()
    .regex(/^[a-z0-9_.]{1,100}$/)
    .optional(),
  url: z
    .url({ protocol: /^https$/ })
    .nullable()
    .optional(),
  type: z.enum(NEWS_TYPES),
  platforms: z.array(ClientPlatformSchema).optional(),
  // Written by the server (see NewsTranslator), never by the admin page.
  translations: z
    .record(
      z.string().regex(/^[a-zA-Z]{2,3}(-[a-zA-Z]{2,4})?$/),
      z.object({
        title: z.string().max(400),
        description: z.string().max(2000).optional(),
      }),
    )
    .optional(),
});

export const AdminNewsListSchema = z
  .array(AdminNewsItemSchema)
  .max(MAX_NEWS_ITEMS)
  .refine((items) => new Set(items.map((i) => i.id)).size === items.length, {
    message: "Duplicate news id",
  });

export class NewsStore {
  private items: NewsItem[];

  constructor(
    private readonly file: string,
    seedFile: string,
    private readonly log?: Logger,
  ) {
    this.items = this.load(seedFile);
  }

  list(): NewsItem[] {
    return this.items;
  }

  // Validates, then writes through a temp file so a crash mid-write never
  // leaves a truncated feed behind.
  replace(items: unknown): NewsItem[] {
    const parsed = AdminNewsListSchema.parse(items);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(parsed, null, 2) + "\n");
    fs.renameSync(tmp, this.file);
    this.items = parsed;
    return parsed;
  }

  private load(seedFile: string): NewsItem[] {
    for (const file of [this.file, seedFile]) {
      if (!fs.existsSync(file)) continue;
      try {
        const json = JSON.parse(fs.readFileSync(file, "utf8"));
        return z.array(NewsItemSchema).parse(json);
      } catch (error) {
        this.log?.error(`Invalid news file ${file}, ignoring it`, error);
      }
    }
    return [];
  }
}

// In-memory admin sessions. The master is a single process and a restart
// only costs the admin a new login.
export class AdminSessions {
  private readonly sessions = new Map<string, number>();

  constructor(
    private readonly ttlMs = 12 * 60 * 60 * 1000,
    private readonly now: () => number = Date.now,
  ) {}

  create(): string {
    this.prune();
    const token = crypto.randomBytes(32).toString("base64url");
    this.sessions.set(token, this.now() + this.ttlMs);
    return token;
  }

  isValid(token: string): boolean {
    const expiresAt = this.sessions.get(token);
    if (expiresAt === undefined) return false;
    if (expiresAt <= this.now()) {
      this.sessions.delete(token);
      return false;
    }
    return true;
  }

  revoke(token: string): void {
    this.sessions.delete(token);
  }

  private prune(): void {
    const now = this.now();
    for (const [token, expiresAt] of this.sessions) {
      if (expiresAt <= now) this.sessions.delete(token);
    }
  }
}

// Hashing first makes the comparison constant-time regardless of length.
export function passwordMatches(provided: string, expected: string): boolean {
  const hash = (s: string) => crypto.createHash("sha256").update(s).digest();
  return crypto.timingSafeEqual(hash(provided), hash(expected));
}

function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (typeof header !== "string" || !header.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length);
}

export function registerNewsRoutes(opts: {
  app: Express;
  store: NewsStore;
  sessions: AdminSessions;
  adminPassword: () => string | undefined;
  // Translates saved news into every game language; null leaves them as is.
  translate?: TranslateFn | null;
  log: Logger;
}) {
  const { app, store, sessions, adminPassword, log } = opts;
  const translate = opts.translate ?? null;

  app.get("/api/news", (_req, res) => {
    res.json(store.list());
  });

  // Lets the admin page tell "disabled" apart from "wrong password".
  app.get("/api/admin/status", (_req, res) => {
    res.json({ enabled: adminPassword() !== undefined });
  });

  // 404 when the panel is disabled (no password set) so the routes aren't
  // advertised; 401 on a missing or expired session.
  const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
    if (adminPassword() === undefined) {
      res.status(404).end();
      return;
    }
    const token = bearerToken(req);
    if (token === null || !sessions.isValid(token)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    next();
  };

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many attempts, try again later" },
  });

  app.post("/api/admin/login", loginLimiter, (req, res) => {
    const expected = adminPassword();
    if (expected === undefined) {
      res.status(404).end();
      return;
    }
    const password: unknown = req.body?.password;
    if (typeof password !== "string" || !passwordMatches(password, expected)) {
      log.warn(`Failed admin login from ${req.ip}`);
      res.status(401).json({ error: "Wrong password" });
      return;
    }
    log.info(`Admin login from ${req.ip}`);
    res.json({ token: sessions.create() });
  });

  app.post("/api/admin/logout", requireAdmin, (req, res) => {
    sessions.revoke(bearerToken(req)!);
    res.status(204).end();
  });

  app.get("/api/admin/news", requireAdmin, (_req, res) => {
    res.json(store.list());
  });

  app.put("/api/admin/news", requireAdmin, async (req, res) => {
    const parsed = AdminNewsListSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid news list",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      });
      return;
    }
    try {
      const translated = await translateNews(
        parsed.data,
        store.list(),
        translate,
        log,
      );
      const items = store.replace(translated);
      log.info(`News feed updated by admin (${items.length} items)`);
      res.json(items);
    } catch (error) {
      log.error("Failed to save news feed", error);
      res.status(500).json({ error: "Could not save" });
    }
  });
}
