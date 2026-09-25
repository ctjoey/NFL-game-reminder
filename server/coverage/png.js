// A PNG decoder in the standard library, because the alternative was a dependency.
//
// The coverage sampler needs one thing from an image: the colour at a pixel. Node ships zlib, and
// PNG is zlib plus a byte-level filter per scanline, so the whole decoder is about a hundred lines
// and the project keeps its two runtime dependencies.
//
// Supports what 506's maps actually are: non-interlaced, 8- or 16-bit, greyscale, RGB, palette or
// either with alpha. Interlaced PNG and JPEG throw rather than guess - a sampler that silently
// reads the wrong pixels is the failure mode this whole exercise exists to remove.
import zlib from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/// Undo the per-scanline filter. Each row is one filter byte then the row's bytes, and every
/// filter is defined against the already-reconstructed bytes to the left and above.
function unfilter(raw, width, height, bpp, stride) {
  const out = Buffer.alloc(height * stride);
  let pos = 0;
  for (let y = 0; y < height; y += 1) {
    const type = raw[pos]; pos += 1;
    const row = y * stride, prev = row - stride;
    for (let i = 0; i < stride; i += 1) {
      const x = raw[pos + i];
      const a = i >= bpp ? out[row + i - bpp] : 0;
      const b = y > 0 ? out[prev + i] : 0;
      const c = i >= bpp && y > 0 ? out[prev + i - bpp] : 0;
      let v;
      switch (type) {
        case 0: v = x; break;
        case 1: v = x + a; break;
        case 2: v = x + b; break;
        case 3: v = x + ((a + b) >> 1); break;
        case 4: v = x + paeth(a, b, c); break;
        default: throw new Error(`unknown PNG filter ${type} on row ${y}`);
      }
      out[row + i] = v & 0xff;
    }
    pos += stride;
  }
  return out;
}

/// Decode to { width, height, rgb } where rgb is 3 bytes per pixel, alpha composited away onto
/// white. The maps are opaque; compositing just means a stray alpha cannot skew a sampled colour.
export function decodePNG(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8) {
    throw new Error('that is a JPEG, and this decoder only reads PNG');
  }
  if (!buf.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG');

  let width = 0, height = 0, depth = 8, colorType = 6, interlace = 0;
  let palette = null, transparency = null;
  const idat = [];

  let pos = 8;
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    pos += 12 + len;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      depth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') transparency = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
  }

  if (!width || !height) throw new Error('PNG has no IHDR');
  if (interlace) throw new Error('interlaced PNG is not supported');
  if (depth !== 8 && depth !== 16 && !(colorType === 3 && depth <= 8)) {
    throw new Error(`unsupported PNG bit depth ${depth}`);
  }

  const channels = CHANNELS[colorType];
  if (!channels) throw new Error(`unsupported PNG colour type ${colorType}`);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bitsPerPixel = channels * depth;
  const stride = Math.ceil((width * bitsPerPixel) / 8);
  const bpp = Math.max(1, Math.ceil(bitsPerPixel / 8));
  const flat = unfilter(raw, width, height, bpp, stride);

  const rgb = Buffer.alloc(width * height * 3);
  const step = depth === 16 ? 2 : 1;   // 16-bit: take the high byte, which is the colour we want

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let r, g, b, a = 255;
      if (colorType === 3) {
        // Sub-byte palette indices pack several pixels into one byte, high bits first.
        const perByte = 8 / depth;
        const idx = depth === 8
          ? flat[y * stride + x]
          : (flat[y * stride + Math.floor(x / perByte)] >> (8 - depth * (1 + (x % perByte)))) & ((1 << depth) - 1);
        if (!palette || idx * 3 + 2 >= palette.length) throw new Error('palette PNG with a bad index');
        r = palette[idx * 3]; g = palette[idx * 3 + 1]; b = palette[idx * 3 + 2];
        if (transparency && idx < transparency.length) a = transparency[idx];
      } else {
        const at = y * stride + x * channels * step;
        if (colorType === 0) { r = g = b = flat[at]; }
        else if (colorType === 4) { r = g = b = flat[at]; a = flat[at + step]; }
        else if (colorType === 2) { r = flat[at]; g = flat[at + step]; b = flat[at + 2 * step]; }
        else { r = flat[at]; g = flat[at + step]; b = flat[at + 2 * step]; a = flat[at + 3 * step]; }
      }
      const o = (y * width + x) * 3;
      if (a === 255) { rgb[o] = r; rgb[o + 1] = g; rgb[o + 2] = b; }
      else {
        const t = a / 255;
        rgb[o] = Math.round(r * t + 255 * (1 - t));
        rgb[o + 1] = Math.round(g * t + 255 * (1 - t));
        rgb[o + 2] = Math.round(b * t + 255 * (1 - t));
      }
    }
  }
  return { width, height, rgb };
}

export function pixelAt(img, x, y) {
  const cx = Math.min(img.width - 1, Math.max(0, Math.round(x)));
  const cy = Math.min(img.height - 1, Math.max(0, Math.round(y)));
  const o = (cy * img.width + cx) * 3;
  return [img.rgb[o], img.rgb[o + 1], img.rgb[o + 2]];
}
