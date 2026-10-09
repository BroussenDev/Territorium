import fs from "fs";
import zlib from "zlib";

// A small PNG decoder for tests (non-interlaced, every color type, depths
// 1-16): straight 8-bit RGBA, as a browser canvas would hand it over.

export interface DecodedPng {
  width: number;
  height: number;
  rgba: Uint8Array;
}

export function decodePng(file: string): DecodedPng {
  const buf = fs.readFileSync(file);
  let pos = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let colorType = 0;
  let palette: Buffer | null = null;
  let trns: Buffer | null = null;
  const idat: Buffer[] = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      colorType = data[9];
      if (data[12] !== 0) throw new Error("interlaced PNG not supported");
    } else if (type === "PLTE") palette = data;
    else if (type === "tRNS") trns = data;
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType]!;
  const bitsPerPixel = channels * depth;
  const stride = Math.ceil((width * bitsPerPixel) / 8);
  const bpp = Math.max(1, Math.ceil(bitsPerPixel / 8));
  const lines = new Uint8Array(stride * height);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = lines.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? out[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[i] = v & 0xff;
    }
    prev = out;
  }

  // One sample of a pixel, scaled to 8 bits.
  const sample = (y: number, x: number, ch: number): number => {
    const row = y * stride;
    if (depth === 16) return lines[row + (x * channels + ch) * 2];
    if (depth === 8) return lines[row + x * channels + ch];
    const bit = (x * channels + ch) * depth;
    const v =
      (lines[row + (bit >> 3)] >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
    return colorType === 3 ? v : Math.round((v * 255) / ((1 << depth) - 1));
  };
  // The raw value, for tRNS keys and palette indexes.
  const rawSample = (y: number, x: number, ch: number): number => {
    const row = y * stride;
    if (depth === 16) {
      const at = row + (x * channels + ch) * 2;
      return (lines[at] << 8) | lines[at + 1];
    }
    if (depth === 8) return lines[row + x * channels + ch];
    const bit = (x * channels + ch) * depth;
    return (
      (lines[row + (bit >> 3)] >> (8 - depth - (bit & 7))) & ((1 << depth) - 1)
    );
  };

  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      if (colorType === 3) {
        const idx = rawSample(y, x, 0);
        rgba[o] = palette![idx * 3];
        rgba[o + 1] = palette![idx * 3 + 1];
        rgba[o + 2] = palette![idx * 3 + 2];
        rgba[o + 3] = trns !== null && idx < trns.length ? trns[idx] : 255;
      } else if (colorType === 0 || colorType === 4) {
        const g = sample(y, x, 0);
        rgba[o] = rgba[o + 1] = rgba[o + 2] = g;
        rgba[o + 3] = colorType === 4 ? sample(y, x, 1) : 255;
        if (colorType === 0 && trns !== null && depth <= 8) {
          if (rawSample(y, x, 0) === trns.readUInt16BE(0)) rgba[o + 3] = 0;
        }
      } else {
        rgba[o] = sample(y, x, 0);
        rgba[o + 1] = sample(y, x, 1);
        rgba[o + 2] = sample(y, x, 2);
        rgba[o + 3] = colorType === 6 ? sample(y, x, 3) : 255;
        if (colorType === 2 && trns !== null && depth === 8) {
          if (
            rgba[o] === trns.readUInt16BE(0) &&
            rgba[o + 1] === trns.readUInt16BE(2) &&
            rgba[o + 2] === trns.readUInt16BE(4)
          ) {
            rgba[o + 3] = 0;
          }
        }
      }
    }
  }
  return { width, height, rgba };
}
