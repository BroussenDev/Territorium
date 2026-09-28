import { assetUrl } from "../core/AssetUrls";
import { PlayerCosmetics } from "../core/Schemas";

// The Nation pack: a standard and a crown that take on the flag of the
// country played in Nations mode. The catalog images are generic previews;
// in a Nations game they are redrawn here around the country's flag.
export const NATION_FLAG_NAME = "etendard_national";
export const NATION_CROWN_NAME = "couronne_nationale";

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

/** The country flag in a gilded frame, topped with a small crown. */
export function nationFlagSvg(flag: string): string {
  const { x, y, w, h } = FLAG_BOX;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 150" width="150" height="150"><defs>${GOLD}<clipPath id="c"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3"/></clipPath></defs><rect x="1" y="${y - 6}" width="148" height="${h + 12}" rx="7" fill="url(#gold)" stroke="#6b4300" stroke-width="1.5"/><image href="${flag}" width="150" height="150" clip-path="url(#c)"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="none" stroke="#6b4300" stroke-width="1.5"/><path d="M57 25L61 7L69 17L75 3L81 17L89 7L93 25Z" fill="url(#gold)" stroke="#6b4300" stroke-width="1.5" stroke-linejoin="round"/><g fill="#fff3b0" stroke="#6b4300" stroke-width="1"><circle cx="6" cy="${y - 1}" r="3"/><circle cx="144" cy="${y - 1}" r="3"/><circle cx="6" cy="${y + h + 1}" r="3"/><circle cx="144" cy="${y + h + 1}" r="3"/></g></svg>`;
}

// Crown body (points and band) the flag is painted into, in its 512 box.
const CROWN_BODY =
  "M84 330L104 196L166 276L206 176L256 262L306 176L346 276L408 196L428 330Z";
const CROWN_BAND = { x: 72, y: 326, w: 368, h: 92 };
const CROWN_BOX = { x: 72, y: 176, w: 368, h: 242 };

/** A gold-rimmed crown whose points and band show the country flag. */
export function nationCrownSvg(flag: string): string {
  const sx = CROWN_BOX.w / FLAG_BOX.w;
  const sy = CROWN_BOX.h / FLAG_BOX.h;
  const ix = CROWN_BOX.x - FLAG_BOX.x * sx;
  const iy = CROWN_BOX.y - FLAG_BOX.y * sy;
  const b = CROWN_BAND;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512"><defs>${GOLD}<linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></linearGradient><clipPath id="c"><path d="${CROWN_BODY}"/><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="20"/></clipPath></defs><g clip-path="url(#c)"><image href="${flag}" x="${ix.toFixed(1)}" y="${iy.toFixed(1)}" width="${(150 * sx).toFixed(1)}" height="${(150 * sy).toFixed(1)}" preserveAspectRatio="none"/><rect x="${CROWN_BOX.x}" y="${CROWN_BOX.y}" width="${CROWN_BOX.w}" height="${CROWN_BOX.h}" fill="url(#shade)"/></g><path d="${CROWN_BODY}" fill="none" stroke="url(#gold)" stroke-width="14" stroke-linejoin="round"/><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="20" fill="none" stroke="url(#gold)" stroke-width="14"/><path d="M${b.x + 10} ${b.y + 4}H${b.x + b.w - 10}" stroke="url(#gold)" stroke-width="10"/><g fill="url(#gold)" stroke="#6b4300" stroke-width="6"><circle cx="104" cy="190" r="18"/><circle cx="408" cy="190" r="18"/><circle cx="206" cy="168" r="20"/><circle cx="306" cy="168" r="20"/><circle cx="256" cy="120" r="26"/></g><path d="M256 146V256" stroke="url(#gold)" stroke-width="12" stroke-linecap="round"/></svg>`;
}

/** Whether the equipped cosmetics include a Nation pack item. */
export function wantsNationArt(cosmetics: PlayerCosmetics): boolean {
  return (
    isNationFlag(cosmetics.flag) || cosmetics.crown?.name === NATION_CROWN_NAME
  );
}

function isNationFlag(flag: string | undefined): boolean {
  return flag?.endsWith(`/${NATION_FLAG_NAME}.svg`) ?? false;
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

const artByFlag = new Map<string, Promise<NationArt | null>>();

/** Draws (once per country) the Nation pack art for a country flag code. */
export function loadNationArt(code: string): Promise<NationArt | null> {
  let art = artByFlag.get(code);
  if (art === undefined) {
    art = fetch(assetUrl(`/flags/${code}.svg`))
      .then((res) => (res.ok ? res.text() : Promise.reject(res.status)))
      .then((text) => {
        const flag = base64Svg(text);
        return {
          flag: svgDataUrl(nationFlagSvg(flag)),
          crown: svgDataUrl(nationCrownSvg(flag)),
        };
      })
      .catch((e) => {
        // The plain country flag and generic crown stay in place.
        console.warn(`Nation pack art for ${code} unavailable`, e);
        return null;
      });
    artByFlag.set(code, art);
  }
  return art;
}
