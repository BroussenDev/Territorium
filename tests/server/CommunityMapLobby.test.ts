import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { GameMapType } from "../../src/core/game/Game";
import {
  isApprovedCommunityMap,
  setApprovedCommunityMaps,
} from "../../src/server/CommunityMapIds";
import { applyGameConfigPatch } from "../../src/server/ConfigPatch";
import { encodePng } from "../../src/server/PngEncode";
import { decodePng } from "../util/Png";
import { testGameConfig } from "../util/Wire";

const APPROVED = { id: "a".repeat(64), name: "Approved" };
const PENDING = { id: "b".repeat(64), name: "Pending" };

describe("community maps in private lobbies", () => {
  it("only takes a map our moderators approved", () => {
    setApprovedCommunityMaps([APPROVED.id]);
    expect(isApprovedCommunityMap(APPROVED.id)).toBe(true);
    expect(isApprovedCommunityMap(PENDING.id)).toBe(false);

    const config = testGameConfig();
    applyGameConfigPatch(config, { customMap: PENDING });
    expect(config.customMap).toBeUndefined();
    applyGameConfigPatch(config, { customMap: APPROVED });
    expect(config.customMap).toEqual(APPROVED);
  });

  it("keeps the map while the host edits other settings", () => {
    setApprovedCommunityMaps([APPROVED.id]);
    const config = testGameConfig();
    applyGameConfigPatch(config, { customMap: APPROVED });
    applyGameConfigPatch(config, { bots: 12 });
    expect(config.customMap).toEqual(APPROVED);
  });

  it("goes back to the official map when the host picks one", () => {
    setApprovedCommunityMaps([APPROVED.id]);
    const config = testGameConfig();
    applyGameConfigPatch(config, { customMap: APPROVED });
    applyGameConfigPatch(config, { gameMap: GameMapType.Europe });
    expect(config.customMap).toBeUndefined();
    expect(config.gameMap).toBe(GameMapType.Europe);
  });
});

describe("encodePng", () => {
  it("writes a PNG that decodes to the same pixels", () => {
    const width = 3;
    const height = 2;
    const rgba = new Uint8Array(width * height * 4);
    for (let i = 0; i < rgba.length; i++) rgba[i] = (i * 37) % 256;
    const file = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), "png-")),
      "t.png",
    );
    fs.writeFileSync(file, encodePng(width, height, rgba));
    const png = decodePng(file);
    expect(png.width).toBe(width);
    expect(png.height).toBe(height);
    expect([...png.rgba]).toEqual([...rgba]);
    fs.rmSync(path.dirname(file), { recursive: true });
  });
});
