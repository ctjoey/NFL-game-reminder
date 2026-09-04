// Renders the app icon (1024x1024, opaque PNG) with no image libraries.
// Design: navy full-bleed background, red swoosh, red football with white stripes and laces,
// silver-rimmed clock. Simplified for legibility at 60px. Usage: node render_icon.mjs out.png
import zlib from 'node:zlib'; import fs from 'node:fs';
const W = 1024, SS = 2, R = W * SS;
const buf = new Float32Array(R * R * 3);
const NAVY = [14, 27, 58], NAVY2 = [28, 46, 92], RED = [190, 24, 34], RED2 = [232, 52, 58], WHITE = [246, 243, 236], SILVER = [200, 206, 216], SILVER2 = [150, 158, 172], FACE = [250, 250, 252], HAND = [16, 28, 60];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const put = (x, y, c) => { const o = (y * R + x) * 3; buf[o] = c[0]; buf[o + 1] = c[1]; buf[o + 2] = c[2]; };
const get = (x, y) => { const o = (y * R + x) * 3; return [buf[o], buf[o + 1], buf[o + 2]]; };
// background: diagonal gradient
for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) put(x, y, mix(NAVY2, NAVY, (x + y) / (2 * R)));
// swoosh: two thick red arcs bottom-left, and a faint silver arc
function arc(cx, cy, r, w, a0, a1, color, alpha = 1) {
  for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) {
    const dx = x - cx, dy = y - cy, d = Math.sqrt(dx * dx + dy * dy);
    if (Math.abs(d - r) > w / 2 + 1.5) continue;
    let a = Math.atan2(dy, dx); if (a < a0) a += Math.PI * 2;
    if (a < a0 || a > a1) continue;
    const edge = Math.min(1, (w / 2 + 1.5 - Math.abs(d - r)) / 1.5);
    put(x, y, mix(get(x, y), color, edge * alpha));
  }
}
arc(0.62 * R, 0.62 * R, 0.56 * R, 0.035 * R, Math.PI * 0.55, Math.PI * 1.02, RED2, 0.95);
arc(0.62 * R, 0.62 * R, 0.62 * R, 0.014 * R, Math.PI * 0.6, Math.PI * 1.0, SILVER2, 0.55);
// football: rotated ellipse
const fx = 0.44 * R, fy = 0.42 * R, ang = -32 * Math.PI / 180, rx = 0.36 * R, ry = 0.215 * R;
const cs = Math.cos(ang), sn = Math.sin(ang);
for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) {
  const dx = x - fx, dy = y - fy, u = dx * cs + dy * sn, v = -dx * sn + dy * cs;
  const e = (u * u) / (rx * rx) + (v * v) / (ry * ry);
  if (e > 1.02) continue;
  const edge = Math.min(1, (1.02 - e) * 60);
  // shading top-left lighter
  let c = mix(RED, RED2, Math.max(0, 0.5 - v / ry * 0.5));
  // outline
  if (e > 0.96) c = WHITE;
  // stripes near each end (perpendicular to long axis)
  if (Math.abs(u) > rx * 0.55 && Math.abs(u) < rx * 0.7) c = WHITE;
  // lace seam + laces
  if (Math.abs(v) < R * 0.006 && Math.abs(u) < rx * 0.42) c = WHITE;
  for (let i = -3; i <= 3; i++) if (Math.abs(u - i * rx * 0.115) < R * 0.007 && Math.abs(v) < R * 0.032) c = WHITE;
  put(x, y, mix(get(x, y), c, edge));
}
// clock: bottom-right, silver rim, white face, navy hands (10:10), red second hand omitted for clarity
const kx = 0.70 * R, ky = 0.70 * R, kr = 0.215 * R;
for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) {
  const dx = x - kx, dy = y - ky, d = Math.sqrt(dx * dx + dy * dy);
  if (d > kr + 2) continue;
  let c;
  if (d > kr * 0.86) c = mix(SILVER, SILVER2, (dy + kr) / (2 * kr));
  else if (d > kr * 0.82) c = HAND;
  else c = FACE;
  const edge = Math.min(1, (kr + 2 - d) / 2);
  put(x, y, mix(get(x, y), c, edge));
}
// hour ticks (12, 3, 6, 9 only) and hands
function seg(x0, y0, x1, y1, w, color) {
  const minx = Math.max(0, Math.floor(Math.min(x0, x1) - w)), maxx = Math.min(R - 1, Math.ceil(Math.max(x0, x1) + w));
  const miny = Math.max(0, Math.floor(Math.min(y0, y1) - w)), maxy = Math.min(R - 1, Math.ceil(Math.max(y0, y1) + w));
  const L2 = (x1 - x0) ** 2 + (y1 - y0) ** 2;
  for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
    const t = Math.max(0, Math.min(1, ((x - x0) * (x1 - x0) + (y - y0) * (y1 - y0)) / L2));
    const px = x0 + t * (x1 - x0), py = y0 + t * (y1 - y0), d = Math.hypot(x - px, y - py);
    if (d > w / 2 + 1) continue;
    put(x, y, mix(get(x, y), color, Math.min(1, (w / 2 + 1 - d))));
  }
}
for (const a of [0, 90, 180, 270]) { const t = a * Math.PI / 180; seg(kx + Math.sin(t) * kr * 0.62, ky - Math.cos(t) * kr * 0.62, kx + Math.sin(t) * kr * 0.76, ky - Math.cos(t) * kr * 0.76, R * 0.012, HAND); }
const hA = (-60) * Math.PI / 180, mA = (60) * Math.PI / 180; // 10:10
seg(kx, ky, kx + Math.sin(hA) * kr * 0.45, ky - Math.cos(hA) * kr * 0.45, R * 0.02, HAND);
seg(kx, ky, kx + Math.sin(mA) * kr * 0.66, ky - Math.cos(mA) * kr * 0.66, R * 0.016, HAND);
for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) { const d = Math.hypot(x - kx, y - ky); if (d < R * 0.014) put(x, y, mix(get(x, y), RED2, Math.min(1, R * 0.014 - d))); }
// downsample + encode
const px = Buffer.alloc(W * W * 3);
for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
  let r = 0, g = 0, b = 0;
  for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) { const c = get(x * SS + i, y * SS + j); r += c[0]; g += c[1]; b += c[2]; }
  const o = (y * W + x) * 3; px[o] = Math.round(r / (SS * SS)); px[o + 1] = Math.round(g / (SS * SS)); px[o + 2] = Math.round(b / (SS * SS));
}
const raw = Buffer.alloc((W * 3 + 1) * W);
for (let y = 0; y < W; y++) { raw[y * (W * 3 + 1)] = 0; px.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3); }
const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = (b) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(W, 4); ihdr[8] = 8; ihdr[9] = 2; // RGB, no alpha
fs.writeFileSync(process.argv[2], Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]));
console.log('wrote', process.argv[2]);
