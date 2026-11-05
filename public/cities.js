// Pixel skylines, drawn from code. Each city is a row of generic buildings plus a few simple landmark shapes.
import { pixelLine, rect } from './sprites.js';

const W = 240;

export function drawCity(g, th, H) {
  const [near, far] = th.hill;
  const lit = th.glow;
  let seed = [...th.id].reduce((n, ch) => n * 31 + ch.charCodeAt(0), 7);
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const beacons = [];

  const box = (x, w, h, color = near) => rect(g, x, H - h, w, h, color);
  const windows = (x, w, h, chance = 0.3) => {
    for (let y = H - h + 2; y < H - 1; y += 2) for (let i = x + 1; i < x + w - 1; i += 2) if (random() < chance) rect(g, i, y, 1, 1, lit);
  };
  const tower = (x, w, h, color = near) => { box(x, w, h, color); windows(x, w, h); };
  const row = (from, to, low, high, color = far, lights = false) => {
    for (let x = from; x < to;) {
      const w = 5 + Math.floor(random() * 7);
      const h = low + Math.floor(random() * (high - low));
      box(x, w, h, color);
      if (lights) windows(x, w, h, 0.22);
      x += w;
    }
  };
  // Narrows upward in equal steps from a wide base.
  const stepped = (x, w, h, steps, color = near) => {
    for (let i = 0; i < steps; i++) {
      const inset = i * Math.floor(w / (steps * 2));
      box(x + inset, w - inset * 2, Math.round(h * (1 - i / steps)), color);
    }
    windows(x, w, Math.round(h * 0.6));
  };
  const spire = (x, h, length, color = near) => { box(x, 1, h + length, color); beacons.push([x, H - h - length]); };
  const triangle = (cx, h, base, color) => { for (let y = 0; y < h; y++) { const half = Math.round((base / 2) * (y / h)); rect(g, cx - half, H - h + y, half * 2 + 1, 1, color); } };
  const disc = (cx, cy, r, color) => { for (let y = -r; y <= r; y++) { const half = Math.round(Math.sqrt(r * r - y * y)); rect(g, cx - half, H - cy + y, half * 2 + 1, 1, color); } };
  const line = (x0, h0, x1, h1, color) => pixelLine(g, x0, H - h0, x1, H - h1, color);
  const floating = (x, w, bottom, h, color = near) => rect(g, x, H - bottom - h, w, h, color);
  const dome = (cx, base, r, color = near) => { for (let y = 0; y <= r; y++) { const half = Math.round(Math.sqrt(r * r - y * y)); rect(g, cx - half, H - base - y - 1, half * 2 + 1, 1, color); } };
  // Two legs that curve together into a single mast, joined by platforms.
  const lattice = (cx, h, spread, color, curve, platforms) => {
    for (let y = 0; y < h; y++) {
      const half = Math.round(((h - y) / h) ** curve * spread);
      if (half < 2) rect(g, cx - half, H - y - 1, half * 2 + 1, 1, color);
      else { rect(g, cx - half, H - y - 1, 2, 1, color); rect(g, cx + half - 1, H - y - 1, 2, 1, color); }
    }
    for (const y of platforms) { const half = Math.round(((h - y) / h) ** curve * spread) + 1; rect(g, cx - half, H - y - 2, half * 2 + 1, 2, color); }
  };

  ({
    newyork() {
      row(0, W, 8, 24);
      row(40, 150, 8, 20, near, true);
      stepped(152, 15, 44, 3); spire(159, 44, 12); // Art deco tower
      for (let i = 0; i < 6; i++) box(170 + i, 11 - i * 2, 38 + i * 2); spire(175, 48, 6); // Crown tower
      tower(183, 7, 30);
      for (let i = 0; i < 44; i++) box(192 + Math.floor(i / 11), 11 - Math.floor(i / 5.5), i + 1); spire(197, 44, 12); // Tapered tower
      row(205, W, 10, 26, near, true);
    },
    chicago() {
      row(0, W, 8, 22);
      row(44, 150, 8, 20, near, true);
      for (const [x, w, h] of [[151, 18, 32], [154, 12, 42], [156, 8, 50]]) tower(x, w, h); // Stacked tower
      spire(158, 50, 8); spire(162, 50, 8);
      row(170, 180, 12, 26, near, true);
      for (let i = 0; i < 46; i++) box(182 + Math.floor(i / 12), 15 - Math.floor(i / 6), i + 1); // Tapered, braced tower
      for (const [a, b] of [[8, 22], [22, 36]]) { line(183, a, 195, b, lit); line(195, a, 183, b, lit); }
      spire(187, 46, 8); spire(191, 46, 8);
      row(198, 212, 12, 26, near, true);
      tower(212, 11, 36);
      row(223, W, 8, 22, near, true);
    },
    toronto() {
      row(0, W, 6, 18);
      row(40, 104, 8, 18, near, true);
      box(106, 22, 5); dome(117, 5, 10); // Domed stadium
      triangle(150, 54, 10, near); // Needle tower, narrowing to a slim mast
      floating(145, 11, 36, 5); rect(g, 145, H - 40, 11, 1, lit); floating(147, 7, 34, 2); floating(148, 5, 45, 2);
      spire(150, 54, 9);
      row(160, 176, 12, 24, near, true);
      tower(178, 11, 34); tower(190, 9, 42); tower(200, 12, 30);
      row(212, W, 8, 20, near, true);
    },
    tokyo() {
      triangle(52, 34, 96, far); for (let y = 0; y < 8; y++) { const half = Math.round(y * 1.4); rect(g, 52 - half, H - 34 + y, half * 2 + 1, 1, '#efe9f5'); } // Distant snow-capped mountain
      row(0, W, 8, 18);
      row(32, 104, 6, 16, near, true);
      lattice(122, 38, 9, '#ff5a3c', 1.5, [12, 25]); spire(122, 38, 3, '#ffb7a8'); // Lattice tower
      row(136, 176, 10, 26, near, true);
      box(178, 3, 60, far); floating(176, 7, 42, 3, far); floating(177, 5, 52, 2, far); spire(179, 60, 4, far); // Very tall broadcast tower
      for (const [x, color] of [[146, '#ff71ce'], [160, '#01cdfe'], [190, '#fffb96'], [206, '#ff71ce']]) { tower(x, 9, 26); rect(g, x + 1, H - 24, 7, 2, color); }
      row(216, W, 8, 24, near, true);
    },
    london() {
      row(0, W, 6, 16);
      row(40, 92, 6, 14, near, true);
      box(106, 6, 32); box(107, 4, 36); triangle(109, 5, 4, near); rect(g, 107, H - 30, 4, 4, lit); // Clock tower
      box(114, 26, 10); windows(114, 26, 10);
      box(142, 17, 14); dome(150, 14, 8); spire(150, 22, 5); // Domed cathedral
      triangle(180, 56, 20, near); windows(177, 7, 34, 0.25); beacons.push([180, H - 56]); // Glass spike
      for (let i = 0; i < 34; i++) { const half = Math.round(Math.sin((i / 34) * Math.PI * 0.72 + 0.5) * 6); rect(g, 200 - half, H - i, half * 2 + 1, 1, near); } // Bullet tower
      for (let a = 0; a < 6.3; a += 0.05) rect(g, 222 + Math.cos(a) * 11, H - 14 + Math.sin(a) * 11, 1, 1, lit); // Observation wheel
      line(216, 0, 222, 14, near); line(228, 0, 222, 14, near);
    },
    paris() {
      row(0, W, 6, 12);
      row(30, 136, 8, 13, near, true);
      box(64, 14, 14); dome(71, 14, 6); spire(71, 20, 4); // Domed church
      lattice(160, 58, 15, near, 2.6, [14, 30]); spire(160, 58, 5); // Lattice tower
      row(180, 214, 8, 13, near, true);
      tower(214, 10, 18);
      row(226, W, 8, 13, near, true);
    },
    sanfrancisco() {
      row(0, 104, 6, 16);
      // Suspension bridge
      for (const x of [20, 80]) { box(x, 3, 34, '#d9482b'); rect(g, x - 1, H - 26, 5, 2, '#d9482b'); rect(g, x - 1, H - 14, 5, 2, '#d9482b'); }
      rect(g, 0, H - 9, 108, 2, '#d9482b');
      for (let x = 0; x < 106; x++) { const k = (x - 51.5) / 30; rect(g, x, H - 34 + Math.min(25, Math.round(k * k * 22)), 1, 1, '#d9482b'); if (x % 5 === 0) rect(g, x, H - 34 + Math.min(25, Math.round(k * k * 22)), 1, 25 - Math.min(25, Math.round(k * k * 22)), '#d9482b'); }
      row(110, W, 8, 24);
      row(118, 150, 10, 26, near, true);
      triangle(160, 54, 16, near); spire(160, 54, 4); // Pyramid tower
      for (let i = 0; i < 48; i++) { const half = Math.round(Math.sin(Math.min(1.5, ((48 - i) / 48) * 2.6)) * 6); rect(g, 184 - half, H - 48 + i, half * 2 + 1, 1, near); } // Rounded tower
      windows(180, 9, 34);
      row(192, W, 10, 28, near, true);
    },
    dubai() {
      row(0, W, 4, 12);
      row(36, 110, 8, 18, near, true);
      for (let i = 0; i < 32; i++) { const w = Math.round(Math.sin((i / 32) * Math.PI) * 8) + 1; rect(g, 122, H - i - 1, w, 1, near); if (i % 4 === 0 && i < 28) rect(g, 123, H - i - 1, Math.max(1, w - 2), 1, lit); } // Sail-shaped hotel
      box(121, 1, 36); beacons.push([121, H - 36]);
      row(138, 176, 12, 28, near, true);
      for (const [w, h] of [[19, 20], [15, 32], [11, 42], [7, 52], [3, 60]]) box(192 - Math.floor(w / 2), w, h); // Supertall stepped tower
      windows(184, 17, 20, 0.3); windows(187, 11, 36, 0.2);
      spire(192, 60, 6);
      row(204, W, 10, 24, near, true);
    },
    sydney() {
      row(0, 100, 8, 22);
      row(30, 88, 8, 18, near, true);
      // Arched bridge
      for (let x = 92; x < 150; x++) { const k = (x - 121) / 29; const y = Math.round((1 - k * k) * 22); rect(g, x, H - 8 - y, 1, 1, near); if (x % 4 === 0) rect(g, x, H - 8 - y, 1, y, near); }
      rect(g, 88, H - 9, 66, 2, near); box(90, 4, 14); box(150, 4, 14);
      beacons.push([121, H - 31]);
      row(156, 178, 10, 28, near, true);
      // Sail-roofed opera house, on the water's edge
      box(180, 44, 4, far);
      for (const [x, h, w] of [[182, 14, 10], [192, 19, 12], [204, 15, 10], [213, 11, 9]]) {
        for (let i = 0; i < h; i++) rect(g, x + Math.round(((h - i) / h) ** 1.7 * (w * 0.7)), H - 4 - h + i, Math.max(1, Math.round((i / h) * w * 0.6)), 1, '#f6f4ec');
      }
      row(226, W, 8, 18, near, true);
    },
    seoul() {
      triangle(36, 30, 104, far); triangle(112, 22, 70, far); // Mountain ridges
      for (let x = 56; x < 96; x++) { const k = (x - 76) / 20; box(x, 1, Math.round(Math.sqrt(1 - k * k) * 16), near); } // Forested hill
      floating(75, 3, 14, 18); floating(73, 7, 28, 4); rect(g, 73, H - 30, 7, 1, lit); spire(76, 32, 5); // Tower on the hill
      row(0, 56, 6, 14, near, true);
      for (let x = 98; x < 168; x += 9) tower(x, 8, 12 + ((x * 7) % 3) * 4); // Rows of apartment blocks
      for (let i = 0; i < 58; i++) box(170 + Math.floor(i / 10), 13 - Math.floor(i / 5), i + 1); windows(171, 11, 40, 0.3); beacons.push([176, H - 59]); // Tapered supertall
      row(186, W, 10, 26, near, true);
    },
    hongkong() {
      for (let x = 0; x < W; x++) box(x, 1, Math.round(30 + Math.sin(x * 0.03 + 0.8) * 8 + Math.sin(x * 0.09) * 3), far); // The Peak, behind the harbour
      row(0, 100, 12, 26, near, true);
      row(100, 150, 16, 28, near, true);
      box(152, 13, 42); triangle(158, 58, 13, near); for (const [a, b] of [[8, 22], [22, 36]]) { line(152, a, 164, b, lit); line(164, a, 152, b, lit); } spire(155, 48, 8); spire(161, 48, 8); // Angular bank tower
      row(167, 180, 18, 32, near, true);
      box(182, 11, 46); box(183, 9, 52); box(185, 5, 58); windows(183, 9, 44, 0.3); spire(187, 58, 4); // Stepped tower
      row(194, 210, 20, 34, near, true);
      tower(211, 9, 44);
      row(220, W, 14, 28, near, true);
      for (const [x, color] of [[30, '#ff71ce'], [62, '#01cdfe'], [108, '#fffb96'], [136, '#ff71ce'], [197, '#01cdfe']]) rect(g, x, H - 8, 7, 2, color); // Harbour signs
    },
    rio() {
      const hill = (cx, r, h, color) => { for (let x = cx - r; x <= cx + r; x++) { const k = (x - cx) / r; box(x, 1, Math.round(Math.sqrt(1 - k * k) * h), color); } };
      triangle(160, 46, 72, far); floating(159, 2, 46, 6, '#f6f4ec'); floating(156, 8, 49, 1, '#f6f4ec'); // Peak and open-armed statue
      hill(30, 36, 18, far);
      row(0, 112, 5, 13, near, true);
      hill(178, 13, 18, near); hill(212, 20, 42, near); // Two rounded granite hills
      line(180, 18, 208, 41, lit); floating(193, 3, 28, 2, '#e53935'); beacons.push([212, H - 42]); // Cable car
      row(120, 164, 5, 12, near, true);
      rect(g, 0, H - 2, W, 2, '#f0d98a'); // Beach
    },
    chongqing() {
      for (let x = 0; x < W; x++) box(x, 1, Math.round(16 + Math.sin(x * 0.05) * 5 + Math.sin(x * 0.13 + 1) * 3), far); // Steep hillside
      row(0, 112, 18, 36, far, true);
      for (let x = 2; x < 100; x += 8) tower(x, 7, 12 + ((x * 5) % 4) * 4);
      for (let i = 0; i < 5; i++) { box(104 + i * 3, 42 - i * 6, 6 + i * 5); windows(104 + i * 3, 42 - i * 6, 6 + i * 5, 0.6); } // Stacked riverside terraces
      line(0, 16, 104, 30, lit); floating(50, 5, 19, 3, '#e53935'); // River cable car
      row(148, 164, 14, 30, near, true);
      for (const [x, h] of [[166, 44], [176, 50], [186, 50], [196, 44]]) { tower(x, 7, h); floating(x + 1, 5, h, 2); beacons.push([x + 3, H - h - 2]); } // Row of slim towers
      floating(166, 37, 38, 3); rect(g, 167, H - 40, 35, 1, lit); // Sky bridge joining them
      row(206, W, 12, 30, near, true);
    },
  })[th.city]();
  return beacons;
}
