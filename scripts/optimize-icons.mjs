// =====================================================================
// Icon generation — downscales the master logo into the sizes the site
// actually displays.
// ---------------------------------------------------------------------
// The master is a 3264x3264 RGBA PNG (~671 KB). It was being served
// verbatim as the favicon, the apple-touch-icon AND the <img> logo in the
// navbar/footer, which render it at 56 CSS px. Raster PNG is already
// deflate-compressed, so Nitro's compressPublicAssets cannot shrink it —
// every visitor downloaded the full 671 KB before the header could paint.
//
// Pure Node (zlib only) so icon regeneration needs no native image
// toolchain. Run manually after changing the master; the outputs are
// committed:
//   node scripts/optimize-icons.mjs
// =====================================================================
import { deflateSync, inflateSync } from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MASTER = join(ROOT, "scripts", "icon-master.png");
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/** Split a PNG into its chunks and pull out IHDR + the concatenated IDAT stream. */
function decodePng(buf) {
  if (!buf.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error("not a PNG");
  let off = 8;
  let ihdr = null;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      ihdr = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        interlace: data[12],
      };
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") break;
    off += 12 + len;
  }
  if (!ihdr) throw new Error("missing IHDR");
  if (ihdr.bitDepth !== 8) throw new Error(`unsupported bit depth ${ihdr.bitDepth}`);
  if (ihdr.interlace !== 0) throw new Error("interlaced PNG unsupported");
  // 6 = RGBA, 2 = RGB. Both are what an exported logo realistically is.
  const channels = ihdr.colorType === 6 ? 4 : ihdr.colorType === 2 ? 3 : 0;
  if (!channels) throw new Error(`unsupported color type ${ihdr.colorType}`);
  return { ...ihdr, channels, raw: inflateSync(Buffer.concat(idat)) };
}

/** Reverse the per-scanline PNG filters, yielding flat RGBA pixel bytes. */
function unfilter({ width, height, channels, raw }) {
  const stride = width * channels;
  const out = Buffer.alloc(stride * height);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const line = raw.subarray(pos, pos + stride);
    pos += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? cur[i - channels] : 0; // left
      const b = prev ? prev[i] : 0; // up
      const c = prev && i >= channels ? prev[i - channels] : 0; // up-left
      let v = line[i];
      switch (filter) {
        case 0:
          break;
        case 1:
          v += a;
          break;
        case 2:
          v += b;
          break;
        case 3:
          v += (a + b) >> 1;
          break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          break;
        }
        default:
          throw new Error(`bad filter ${filter}`);
      }
      cur[i] = v & 0xff;
    }
  }
  return out;
}

/**
 * Area-average resampler. Alpha is premultiplied before averaging and
 * divided back out after, so pixels bordering transparency don't drag the
 * logo's edges toward black.
 */
function resize(src, sw, sh, channels, size) {
  const dst = Buffer.alloc(size * size * 4);
  const xRatio = sw / size;
  const yRatio = sh / size;
  for (let y = 0; y < size; y++) {
    const y0 = Math.floor(y * yRatio);
    const y1 = Math.min(sh, Math.max(y0 + 1, Math.ceil((y + 1) * yRatio)));
    for (let x = 0; x < size; x++) {
      const x0 = Math.floor(x * xRatio);
      const x1 = Math.min(sw, Math.max(x0 + 1, Math.ceil((x + 1) * xRatio)));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const i = (sy * sw + sx) * channels;
          const alpha = channels === 4 ? src[i + 3] : 255;
          const w = alpha / 255;
          r += src[i] * w;
          g += src[i + 1] * w;
          b += src[i + 2] * w;
          a += alpha;
          n++;
        }
      }
      const o = (y * size + x) * 4;
      const aAvg = a / n;
      const wSum = a / 255;
      if (wSum > 0) {
        dst[o] = Math.round(r / wSum);
        dst[o + 1] = Math.round(g / wSum);
        dst[o + 2] = Math.round(b / wSum);
      }
      dst[o + 3] = Math.round(aAvg);
    }
  }
  return dst;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([len, typeAndData, crc]);
}

/** Encode RGBA pixels as a PNG, trying every filter per scanline. */
function encodePng(pixels, size) {
  const stride = size * 4;
  const rows = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    const cur = pixels.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null;
    // Pick the filter with the lowest sum of absolute differences — the
    // standard heuristic; costs nothing at these sizes and helps deflate.
    let best = null;
    let bestScore = Infinity;
    for (let f = 0; f <= 4; f++) {
      const line = Buffer.alloc(stride);
      let score = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= 4 ? cur[i - 4] : 0;
        const b = prev ? prev[i] : 0;
        const c = prev && i >= 4 ? prev[i - 4] : 0;
        let v;
        switch (f) {
          case 0:
            v = cur[i];
            break;
          case 1:
            v = cur[i] - a;
            break;
          case 2:
            v = cur[i] - b;
            break;
          case 3:
            v = cur[i] - ((a + b) >> 1);
            break;
          default: {
            const p = a + b - c;
            const pa = Math.abs(p - a);
            const pb = Math.abs(p - b);
            const pc = Math.abs(p - c);
            v = cur[i] - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          }
        }
        line[i] = v & 0xff;
        score += Math.min(line[i], 256 - line[i]);
      }
      if (score < bestScore) {
        bestScore = score;
        best = { f, line };
      }
    }
    rows[y * (stride + 1)] = best.f;
    best.line.copy(rows, y * (stride + 1) + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(rows, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const png = decodePng(readFileSync(MASTER));
const pixels = unfilter(png);
console.log(
  `master: ${png.width}x${png.height} (${(readFileSync(MASTER).length / 1024).toFixed(1)} KB)`,
);

// 256 covers the 56 CSS px logo at 4x DPI and doubles as the
// apple-touch-icon; 48 is the browser-chrome favicon.
for (const [size, out] of [
  [256, join(ROOT, "public", "chessox-icon.png")],
  [48, join(ROOT, "public", "favicon.ico")],
]) {
  const buf = encodePng(resize(pixels, png.width, png.height, png.channels, size), size);
  writeFileSync(out, buf);
  console.log(
    `  ${size}x${size} -> ${out.replace(ROOT, ".")} (${(buf.length / 1024).toFixed(1)} KB)`,
  );
}
