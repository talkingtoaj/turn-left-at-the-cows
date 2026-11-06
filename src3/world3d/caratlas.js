// The player's car's trim textures, drawn in code on one 512 px atlas (no
// image files): number plates (a made-up plate), grille, headlight and tail
// light lenses, hubcap, tyre tread and sidewall, seat fabric, a badge, and
// flat swatches for plastic, rubber and chrome. Three maps share the layout:
//   map       colour (sRGB)
//   mr        roughness in G, metalness in B (three's roughnessMap / metalnessMap)
//   emissive  the lamp lenses' glow (tail lights red, so a shader can tell
//             them from the headlights for the brake lights)
//
//   const A = carAtlas(); A.rect('plate') -> [u0, v0, u1, v1]; A.sw('black') -> [u, v]

import * as THREE from 'three';

const N = 512;
const RECTS = {
  plate: [0, 0, 256, 128],
  grille: [256, 0, 256, 64],
  head: [256, 64, 128, 64],
  tail: [384, 64, 128, 64],
  hubcap: [0, 128, 128, 128],
  tread: [128, 128, 256, 64],
  fabric: [384, 128, 128, 128],
  badge: [0, 384, 96, 32],
  indicator: [128, 192, 64, 32],
};
// Flat swatches: [colour, roughness, metalness].
const SW = {
  black: ['#151617', 0.55, 0],
  satin: ['#202224', 0.4, 0],
  rubber: ['#1a1a1a', 0.9, 0],
  chrome: ['#d8dadc', 0.12, 1],
  steel: ['#8a8d90', 0.35, 1],
  alu: ['#d4d8dc', 0.32, 1],
  gap: ['#0a0a0a', 0.9, 0],
  dash: ['#2a2622', 0.8, 0],
  seat: ['#4a3e36', 0.95, 0],
  liner: ['#0e0e0e', 0.95, 0],
  amber: ['#d88a20', 0.2, 0],
  mirror: ['#9fb2c0', 0.05, 1],
  exhaust: ['#3a3633', 0.6, 0.6],
  plateBack: ['#e8e4d6', 0.5, 0],
  red: ['#7a1410', 0.2, 0],
  white: ['#e6e6e2', 0.5, 0],
  wood: ['#4a2e1c', 0.6, 0],
};
const SW_NAMES = Object.keys(SW);
const swRect = (i) => [(i % 16) * 32, 320 + Math.floor(i / 16) * 32, 32, 32];

let cached = null;

export function carAtlas() {
  if (cached) return cached;
  const mk = () => {
    const c = document.createElement('canvas');
    c.width = c.height = N;
    return [c, c.getContext('2d')];
  };
  const [cc, g] = mk();
  const [mc, m] = mk();
  const [ec, e] = mk();
  g.fillStyle = '#202020';
  g.fillRect(0, 0, N, N);
  // mr: default plastic (roughness 0.6, not metal).
  const mrFill = (r, rough, metal) => {
    m.fillStyle = `rgb(0, ${Math.round(rough * 255)}, ${Math.round(metal * 255)})`;
    m.fillRect(...r);
  };
  mrFill([0, 0, N, N], 0.6, 0);
  e.fillStyle = '#000';
  e.fillRect(0, 0, N, N);

  // Number plate: cream with dark blue letters, a made-up county plate.
  {
    const [x, y, w, h] = RECTS.plate;
    g.fillStyle = '#ece6d2';
    g.fillRect(x, y, w, h);
    g.strokeStyle = '#2c3a5c';
    g.lineWidth = 5;
    g.strokeRect(x + 5, y + 5, w - 10, h - 10);
    g.fillStyle = '#2c3a5c';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = 'bold 15px sans-serif';
    g.fillText('ASHFORD COUNTY', x + w / 2, y + 20);
    g.font = 'bold 58px monospace';
    g.fillText('KDR 487', x + w / 2, y + 70);
    g.font = 'bold 13px sans-serif';
    g.fillText('1987', x + w / 2, y + 110);
    g.fillStyle = '#b8402a';
    g.fillRect(x + 14, y + 100, 28, 18); // registration sticker
    mrFill(RECTS.plate, 0.45, 0.2);
  }
  // Grille: dark horizontal slats with a chrome surround.
  {
    const [x, y, w, h] = RECTS.grille;
    g.fillStyle = '#0c0c0c';
    g.fillRect(x, y, w, h);
    for (let k = 0; k < 6; k++) {
      const yy = y + 8 + k * 8.5;
      const grad = g.createLinearGradient(0, yy, 0, yy + 5);
      grad.addColorStop(0, '#7a7c80');
      grad.addColorStop(1, '#2a2b2d');
      g.fillStyle = grad;
      g.fillRect(x + 6, yy, w - 12, 4);
    }
    g.strokeStyle = '#d0d2d4';
    g.lineWidth = 5;
    g.strokeRect(x + 2.5, y + 2.5, w - 5, h - 5);
    // A small badge in the middle.
    g.fillStyle = '#c8cacc';
    g.fillRect(x + w / 2 - 14, y + h / 2 - 7, 28, 14);
    g.fillStyle = '#20345a';
    g.fillRect(x + w / 2 - 11, y + h / 2 - 4, 22, 8);
    mrFill(RECTS.grille, 0.35, 0.6);
  }
  // Headlight: rectangular lens with a reflector and fluted glass.
  {
    const [x, y, w, h] = RECTS.head;
    const grad = g.createRadialGradient(x + w / 2, y + h / 2, 4, x + w / 2, y + h / 2, w / 2);
    grad.addColorStop(0, '#fffbe8');
    grad.addColorStop(0.35, '#c9cdd0');
    grad.addColorStop(1, '#6c7378');
    g.fillStyle = grad;
    g.fillRect(x, y, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 1;
    for (let k = 1; k < 16; k++) {
      g.beginPath();
      g.moveTo(x + (k * w) / 16, y + 3);
      g.lineTo(x + (k * w) / 16, y + h - 3);
      g.stroke();
    }
    g.strokeStyle = '#e0e2e4';
    g.lineWidth = 4;
    g.strokeRect(x + 2, y + 2, w - 4, h - 4);
    mrFill(RECTS.head, 0.08, 0.3);
    const eg = e.createRadialGradient(x + w / 2, y + h / 2, 2, x + w / 2, y + h / 2, w / 2);
    eg.addColorStop(0, '#fff6d8');
    eg.addColorStop(1, '#6a6656');
    e.fillStyle = eg;
    e.fillRect(x + 4, y + 4, w - 8, h - 8);
  }
  // Tail light: red with an amber indicator outboard and a white reverse lamp inboard.
  {
    const [x, y, w, h] = RECTS.tail;
    g.fillStyle = '#8c1410';
    g.fillRect(x, y, w, h);
    g.fillStyle = '#c87418';
    g.fillRect(x + w - 30, y, 30, h);
    g.fillStyle = '#d8d8d0';
    g.fillRect(x, y, 22, h);
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 1.5;
    for (let k = 1; k < 8; k++) {
      g.beginPath();
      g.moveTo(x, y + (k * h) / 8);
      g.lineTo(x + w, y + (k * h) / 8);
      g.stroke();
    }
    g.strokeStyle = '#1a1a1a';
    g.lineWidth = 4;
    g.strokeRect(x + 2, y + 2, w - 4, h - 4);
    mrFill(RECTS.tail, 0.1, 0);
    e.fillStyle = '#c01810';
    e.fillRect(x + 24, y + 4, w - 56, h - 8);
    e.fillStyle = '#3a2408';
    e.fillRect(x + w - 28, y + 4, 24, h - 8);
  }
  // Amber indicator lens.
  {
    const [x, y, w, h] = RECTS.indicator;
    g.fillStyle = '#d88a20';
    g.fillRect(x, y, w, h);
    g.strokeStyle = '#1a1a1a';
    g.lineWidth = 3;
    g.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
    mrFill(RECTS.indicator, 0.1, 0);
    e.fillStyle = '#2a1804';
    e.fillRect(x + 3, y + 3, w - 6, h - 6);
  }
  // Hubcap: brushed silver disc with slots and a centre cap.
  {
    const [x, y, w] = RECTS.hubcap;
    const cx = x + w / 2;
    const cy = y + w / 2;
    g.fillStyle = '#141414';
    g.fillRect(x, y, w, w);
    const grad = g.createRadialGradient(cx - 10, cy - 10, 4, cx, cy, w / 2);
    grad.addColorStop(0, '#f0f0f0');
    grad.addColorStop(0.7, '#a8acb0');
    grad.addColorStop(1, '#6a6e72');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(cx, cy, w / 2 - 3, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#26282a';
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      g.save();
      g.translate(cx + Math.cos(a) * 38, cy + Math.sin(a) * 38);
      g.rotate(a);
      g.fillRect(-9, -4, 18, 8);
      g.restore();
    }
    g.fillStyle = '#5a5e62';
    g.beginPath();
    g.arc(cx, cy, 15, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#d8dadc';
    g.beginPath();
    g.arc(cx, cy, 10, 0, Math.PI * 2);
    g.fill();
    mrFill(RECTS.hubcap, 0.25, 0.9);
  }
  // Tyre: u around the wheel, v across from one sidewall to the other.
  {
    const [x, y, w, h] = RECTS.tread;
    g.fillStyle = '#1b1b1b';
    g.fillRect(x, y, w, h);
    // Tread blocks in the middle 50%.
    g.fillStyle = '#0d0d0d';
    for (let k = 0; k < 48; k++) {
      const xx = x + (k * w) / 48;
      g.fillRect(xx, y + h * 0.27, 1.6, h * 0.46);
      g.fillRect(xx + 2.5, y + h * 0.42, 2.5, h * 0.16);
    }
    g.fillRect(x, y + h * 0.36, w, 1.5);
    g.fillRect(x, y + h * 0.62, w, 1.5);
    // Sidewall lettering bumps.
    g.fillStyle = '#262626';
    for (let k = 0; k < 12; k++) {
      g.fillRect(x + k * 21 + 4, y + 5, 10, 3);
      g.fillRect(x + k * 21 + 9, y + h - 8, 10, 3);
    }
    mrFill(RECTS.tread, 0.92, 0);
  }
  // Seat velour: brown with a fine weave.
  {
    const [x, y, w, h] = RECTS.fabric;
    g.fillStyle = '#4a3c32';
    g.fillRect(x, y, w, h);
    let seed = 12345;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 900; k++) {
      g.fillStyle = rnd() < 0.5 ? 'rgba(255,240,220,0.06)' : 'rgba(0,0,0,0.1)';
      g.fillRect(x + rnd() * w, y + rnd() * h, 2, 2);
    }
    for (let k = 0; k < h; k += 16) {
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(x, y + k, w, 2);
    }
    mrFill(RECTS.fabric, 1, 0);
  }
  // Boot badge.
  {
    const [x, y, w, h] = RECTS.badge;
    g.fillStyle = '#1a1a1a';
    g.fillRect(x, y, w, h);
    g.fillStyle = '#e4e6e8';
    g.font = 'italic bold 24px serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('GL', x + w / 2, y + h / 2 + 1);
    mrFill(RECTS.badge, 0.15, 1);
  }
  SW_NAMES.forEach((name, i) => {
    const [col, rough, metal] = SW[name];
    const r = swRect(i);
    g.fillStyle = col;
    g.fillRect(...r);
    mrFill(r, rough, metal);
  });
  // Lamp swatches glow a little too.
  const glowSw = { amber: '#3a2408', red: '#6a0c08' };
  for (const [name, col] of Object.entries(glowSw)) {
    e.fillStyle = col;
    e.fillRect(...swRect(SW_NAMES.indexOf(name)));
  }

  const tex = (canvas, srgb) => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.flipY = false;
    t.anisotropy = 4;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    return t;
  };
  const uv = (px, py) => [px / N, py / N];
  cached = {
    map: tex(cc, true),
    mr: tex(mc, false),
    emissive: tex(ec, true),
    // [u0, v0, u1, v1] of a named picture (v down, flipY off).
    rect(name, inset = 0) {
      const [x, y, w, h] = RECTS[name];
      return [...uv(x + inset, y + inset), ...uv(x + w - inset, y + h - inset)];
    },
    sw(name) {
      const [x, y] = swRect(SW_NAMES.indexOf(name));
      return uv(x + 16, y + 16);
    },
    has(name) {
      return SW_NAMES.includes(name);
    },
  };
  return cached;
}
