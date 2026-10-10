import type { Express } from "express";
import express from "express";
import rateLimit from "express-rate-limit";
import type { Logger } from "winston";
import zlib from "zlib";
import {
  buildCommunityMap,
  checkMapSource,
  MAX_MAP_TILES,
  unpackUpload,
  type MapSource,
} from "../core/game/CommunityMaps";
import { isProfane } from "./Censor";
import { verifyClientToken } from "./jwt";
import { encodePng } from "./PngEncode";
import { ServerEnv } from "./ServerEnv";

// Publishing a map from the map editor. The client sends what was drawn
// (core/game/CommunityMaps.ts); this server builds the map itself with the
// generator, so the files that end up on our servers are the generator's,
// never the sender's, and hands them to the API, which keeps them for review
// and the community maps gallery.

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/** Builds a map from an upload; the reason it is refused otherwise. */
export async function buildFromUpload(raw: Uint8Array): Promise<
  | { error: string }
  | {
      source: MapSource;
      built: Awaited<ReturnType<typeof buildCommunityMap>>;
      gzSource: Buffer;
    }
> {
  const upload = unpackUpload(raw);
  if (upload === null) return { error: "bad upload" };
  let tiles: Uint8Array;
  try {
    tiles = zlib.gunzipSync(upload.tiles, { maxOutputLength: MAX_MAP_TILES });
  } catch {
    return { error: "bad tiles" };
  }
  const source: MapSource = { ...upload.header, tiles };
  const refused = checkMapSource(source);
  if (refused !== null) return { error: refused };
  if (isProfane(source.name) || source.nations.some((n) => isProfane(n.name))) {
    return { error: "name_refused" };
  }
  return {
    source,
    built: await buildCommunityMap(source),
    gzSource: Buffer.from(upload.tiles),
  };
}

export function registerCommunityMapRoutes(app: Express, log: Logger): void {
  const limiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 6,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "too_many" },
  });

  app.post(
    "/api/community-maps",
    limiter,
    express.raw({ type: "application/octet-stream", limit: MAX_UPLOAD_BYTES }),
    async (req, res) => {
      const auth = req.headers.authorization;
      if (!auth?.startsWith("Bearer ")) {
        return res.status(401).json({ error: "sign_in" });
      }
      const verified = await verifyClientToken(auth.slice("Bearer ".length));
      if (verified.type !== "success" || verified.claims === null) {
        return res.status(401).json({ error: "sign_in" });
      }
      if (!Buffer.isBuffer(req.body)) {
        return res.status(400).json({ error: "bad upload" });
      }
      const out = await buildFromUpload(new Uint8Array(req.body));
      if ("error" in out) return res.status(400).json({ error: out.error });
      const { source, built, gzSource } = out;
      const g = built.generated;
      try {
        const response = await fetch(
          `${ServerEnv.jwtIssuer()}/community-maps`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": ServerEnv.apiKey(),
            },
            body: JSON.stringify({
              author: verified.persistentId,
              id: built.id,
              name: built.manifest.name,
              width: source.width,
              height: source.height,
              nations: built.manifest.nations.length,
              landTiles: g.map.numLandTiles,
              files: {
                "map.bin": Buffer.from(g.map.data).toString("base64"),
                "map4x.bin": Buffer.from(g.map4x.data).toString("base64"),
                "map16x.bin": Buffer.from(g.map16x.data).toString("base64"),
                "manifest.json": Buffer.from(
                  JSON.stringify(built.manifest),
                ).toString("base64"),
                "thumbnail.png": encodePng(
                  g.thumbnail.width,
                  g.thumbnail.height,
                  g.thumbnail.rgba,
                ).toString("base64"),
                "source.gz": gzSource.toString("base64"),
              },
            }),
            signal: AbortSignal.timeout(30_000),
          },
        );
        const body = await response.json().catch(() => ({}));
        log.info(
          `community map ${built.id.slice(0, 12)} "${built.manifest.name}" sent: ${response.status}`,
        );
        return res
          .status(response.status)
          .json({ ...body, droppedNations: built.droppedNations });
      } catch (error) {
        log.error("community map: API unreachable", error);
        return res.status(502).json({ error: "unavailable" });
      }
    },
  );
}
