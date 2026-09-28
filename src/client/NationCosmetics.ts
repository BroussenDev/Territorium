import { assetUrl } from "../core/AssetUrls";
import { type ClanCrest, CREST_COLORS, crestOf } from "../core/ClanCrest";
import {
  isNationFlag,
  NATION_CROWN_NAME,
  NATION_FLAG_NAME,
} from "../core/NationPack";
import { PlayerCosmetics } from "../core/Schemas";
import { CREST_VIEW_BOX, crestMarkup } from "./components/clan/CrestArt";
import type { ResolvedCosmetic } from "./Cosmetics";

// The Nation pack: a standard and a crown that carry the wearer's clan crest
// in a gold round, on a field of the clan's colors, or on the flag of the
// country played in a Nations game. The catalog images are generic
// previews; the art is redrawn here.
export { wearsNationPack as wantsNationArt } from "../core/NationPack";

export type WearerCrest = NonNullable<PlayerCosmetics["clanCrest"]>;

export interface NationArt {
  flag: string;
  crown: string;
}

// Country flags are 150×150 squares with the flag itself drawn in this box.
const FLAG_BOX = { x: 7.5, y: 32.8, w: 135, h: 84.4 };

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function base64Svg(svg: string): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(svg)) {
    binary += String.fromCharCode(byte);
  }
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}

const GOLD = `<linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3b0"/><stop offset=".45" stop-color="#f5c542"/><stop offset="1" stop-color="#a86b00"/></linearGradient>`;

/** A 150×150 flag quartered in the clan's field and charge colors. */
export function clanFieldSvg(crest: ClanCrest): string {
  const { x, y, w, h } = FLAG_BOX;
  const field = CREST_COLORS[crest.field];
  const charge = CREST_COLORS[crest.charge];
  const [hw, hh] = [w / 2, h / 2];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 150" width="150" height="150"><rect x="${x}" y="${y}" width="${hw}" height="${hh}" fill="${field}"/><rect x="${x + hw}" y="${y}" width="${hw}" height="${hh}" fill="${charge}"/><rect x="${x}" y="${y + hh}" width="${hw}" height="${hh}" fill="${charge}"/><rect x="${x + hw}" y="${y + hh}" width="${hw}" height="${hh}" fill="${field}"/></svg>`;
}

/** The clan crest in a gold round of radius 36, centered on (cx, cy). */
function crestMedallion(
  wearer: WearerCrest,
  cx: number,
  cy: number,
  scale: number,
): string {
  const crest = crestOf(wearer.crest, wearer.tag);
  const { x, y, w, h } = CREST_VIEW_BOX;
  const height = 46;
  const width = (height * w) / h;
  return `<g transform="translate(${cx} ${cy}) scale(${scale})"><circle r="36" fill="url(#gold)" stroke="#6b4300" stroke-width="1.5"/><circle r="31" fill="#fdf6dc" stroke="#6b4300" stroke-width="1"/><svg x="${(-width / 2).toFixed(1)}" y="${-height / 2}" width="${width.toFixed(1)}" height="${height}" viewBox="${x} ${y} ${w} ${h}">${crestMarkup(crest, wearer.tag, "crest-sheen")}</svg></g>`;
}

/**
 * The flag in a gilded frame, topped with a small crown, with the wearer's
 * clan crest in a gold round at its center when there is one.
 */
export function nationFlagSvg(flag: string, wearer?: WearerCrest): string {
  const { x, y, w, h } = FLAG_BOX;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 150" width="150" height="150"><defs>${GOLD}<clipPath id="c"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3"/></clipPath></defs><rect x="1" y="${y - 6}" width="148" height="${h + 12}" rx="7" fill="url(#gold)" stroke="#6b4300" stroke-width="1.5"/><image href="${flag}" width="150" height="150" clip-path="url(#c)"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="none" stroke="#6b4300" stroke-width="1.5"/><path d="M57 25L61 7L69 17L75 3L81 17L89 7L93 25Z" fill="url(#gold)" stroke="#6b4300" stroke-width="1.5" stroke-linejoin="round"/><g fill="#fff3b0" stroke="#6b4300" stroke-width="1"><circle cx="6" cy="${y - 1}" r="3"/><circle cx="144" cy="${y - 1}" r="3"/><circle cx="6" cy="${y + h + 1}" r="3"/><circle cx="144" cy="${y + h + 1}" r="3"/></g>${wearer ? crestMedallion(wearer, 75, 75, 0.9) : ""}</svg>`;
}

// Crown body (points and band) the flag is painted into, in its 512 box.
const CROWN_BODY =
  "M84 330L104 196L166 276L206 176L256 262L306 176L346 276L408 196L428 330Z";
const CROWN_BAND = { x: 72, y: 326, w: 368, h: 92 };
const CROWN_BOX = { x: 72, y: 176, w: 368, h: 242 };

/**
 * A gold-rimmed crown whose points and band show the flag, with the
 * wearer's clan crest in a gold round on the band when there is one.
 */
export function nationCrownSvg(flag: string, wearer?: WearerCrest): string {
  const sx = CROWN_BOX.w / FLAG_BOX.w;
  const sy = CROWN_BOX.h / FLAG_BOX.h;
  const ix = CROWN_BOX.x - FLAG_BOX.x * sx;
  const iy = CROWN_BOX.y - FLAG_BOX.y * sy;
  const b = CROWN_BAND;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512"><defs>${GOLD}<linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></linearGradient><clipPath id="c"><path d="${CROWN_BODY}"/><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="20"/></clipPath></defs><g clip-path="url(#c)"><image href="${flag}" x="${ix.toFixed(1)}" y="${iy.toFixed(1)}" width="${(150 * sx).toFixed(1)}" height="${(150 * sy).toFixed(1)}" preserveAspectRatio="none"/><rect x="${CROWN_BOX.x}" y="${CROWN_BOX.y}" width="${CROWN_BOX.w}" height="${CROWN_BOX.h}" fill="url(#shade)"/></g><path d="${CROWN_BODY}" fill="none" stroke="url(#gold)" stroke-width="14" stroke-linejoin="round"/><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="20" fill="none" stroke="url(#gold)" stroke-width="14"/><path d="M${b.x + 10} ${b.y + 4}H${b.x + b.w - 10}" stroke="url(#gold)" stroke-width="10"/><g fill="url(#gold)" stroke="#6b4300" stroke-width="6"><circle cx="104" cy="190" r="18"/><circle cx="408" cy="190" r="18"/><circle cx="206" cy="168" r="20"/><circle cx="306" cy="168" r="20"/><circle cx="256" cy="120" r="26"/></g><path d="M256 146V256" stroke="url(#gold)" stroke-width="12" stroke-linecap="round"/>${wearer ? crestMedallion(wearer, 256, b.y + 12, 1.7) : ""}</svg>`;
}

function drawArt(flag: string, wearer?: WearerCrest): NationArt {
  return {
    flag: svgDataUrl(nationFlagSvg(flag, wearer)),
    crown: svgDataUrl(nationCrownSvg(flag, wearer)),
  };
}

const artByCrest = new Map<string, NationArt>();

/** The Nation pack art outside a Nations game: the clan's own colors. */
export function clanNationArt(wearer: WearerCrest): NationArt {
  const key = `${wearer.tag}|${wearer.crest}`;
  let art = artByCrest.get(key);
  if (art === undefined) {
    const crest = crestOf(wearer.crest, wearer.tag);
    art = drawArt(base64Svg(clanFieldSvg(crest)), wearer);
    artByCrest.set(key, art);
  }
  return art;
}

/**
 * `cosmetics` with its Nation pack items drawn in the wearer's clan crest
 * and colors; unchanged when there is nothing to draw.
 */
export function withClanArt(cosmetics: PlayerCosmetics): PlayerCosmetics {
  if (cosmetics.clanCrest === undefined) return cosmetics;
  const shown = { ...cosmetics };
  applyNationArt(shown, cosmetics, clanNationArt(cosmetics.clanCrest));
  return shown;
}

/**
 * Swaps the Nation pack items in `cosmetics` (a player's cosmetics in a
 * Nations game, whose flag is already the country's) for the art drawn
 * around their country. `equipped` is what the player chose.
 */
export function applyNationArt(
  cosmetics: PlayerCosmetics,
  equipped: PlayerCosmetics,
  art: NationArt,
): void {
  if (isNationFlag(equipped.flag)) cosmetics.flag = art.flag;
  if (cosmetics.crown?.name === NATION_CROWN_NAME) {
    cosmetics.crown = { ...cosmetics.crown, url: art.crown };
  }
}

/**
 * A catalog item as its wearer will see it: the Nation pack's standard and
 * crown drawn with their clan crest. Other items are returned as they are.
 */
export function withCrestPreview(
  item: ResolvedCosmetic,
  wearer: WearerCrest | null,
): ResolvedCosmetic {
  const c = item.cosmetic as { name: string; url?: string } | null;
  if (wearer === null || c === null) return item;
  const isFlag = item.type === "flag" && c.name === NATION_FLAG_NAME;
  const isCrown = item.type === "crown" && c.name === NATION_CROWN_NAME;
  if (!isFlag && !isCrown) return item;
  const art = clanNationArt(wearer);
  return {
    ...item,
    cosmetic: { ...c, url: isFlag ? art.flag : art.crown },
  } as ResolvedCosmetic;
}

const artByFlag = new Map<string, Promise<NationArt | null>>();

/**
 * Draws (once per country and crest) the Nation pack art for a country flag
 * code, with the wearer's clan crest when there is one.
 */
export function loadNationArt(
  code: string,
  wearer?: WearerCrest,
): Promise<NationArt | null> {
  const key = wearer ? `${code}|${wearer.tag}|${wearer.crest}` : code;
  let art = artByFlag.get(key);
  if (art === undefined) {
    art = fetch(assetUrl(`/flags/${code}.svg`))
      .then((res) => (res.ok ? res.text() : Promise.reject(res.status)))
      .then((text) => drawArt(base64Svg(text), wearer))
      .catch((e) => {
        // The plain country flag and generic crown stay in place.
        console.warn(`Nation pack art for ${code} unavailable`, e);
        return null;
      });
    artByFlag.set(key, art);
  }
  return art;
}
