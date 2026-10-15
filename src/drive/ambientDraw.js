// Drawing for moving ambient life (Phaser): traffic, animals, people, birds,
// dust, chimney smoke and cloud shadows, plus the hill shading.
//
// Speed: Phaser re-tessellates every Graphics shape every frame (a circle is
// about 100 points), so nothing here is drawn as Graphics per frame. Shapes
// are baked once into textures and shown with pooled Images, which batch
// into a few cheap quads. Only things near the camera are shown.

import { drawCar, drawCarShadow } from './car.js';
import { drawLocal } from './render.js';
import { hashString, makeRng } from './geom.js';

// Sun offset per metre of height (same as render.js: shadows fall WNW).
const SUN = { x: -0.75, y: -0.25 };
const PPM = 10; // texture pixels per metre for baked sprites

// ---------- texture helpers ----------

function canvasTexture(scene, key, w, h, paint) {
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, w, h);
  paint(tex.getContext(), w, h);
  tex.refresh();
  return key;
}

// Bakes a Graphics drawing (in metres, centred on the origin) into a canvas
// texture of wM x hM metres. Canvas, not a render target, so no extra
// framebuffers are made.
function bake(scene, key, wM, hM, draw) {
  if (scene.textures.exists(key)) return key;
  const w = Math.ceil(wM * PPM);
  const h = Math.ceil(hM * PPM);
  const g = scene.make.graphics({}, false);
  g.translateCanvas(w / 2, h / 2);
  g.scaleCanvas(PPM, PPM);
  draw(g);
  g.generateTexture(key, w, h);
  g.destroy();
  return key;
}

// Soft round blob, white, for tinting (dust, smoke, soft shadows).
function puffTexture(scene) {
  return canvasTexture(scene, 'amb_puff', 64, 64, (ctx, w) => {
    const gr = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.5, 'rgba(255,255,255,0.75)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, w, w);
  });
}

// Cloud shadow: a dark soft-edged blob with a slightly lumpy outline.
function cloudTexture(scene) {
  return canvasTexture(scene, 'amb_cloud', 256, 256, (ctx, w) => {
    const blobs = [[0.5, 0.5, 0.42], [0.36, 0.44, 0.3], [0.64, 0.56, 0.3], [0.5, 0.36, 0.26], [0.46, 0.64, 0.26]];
    for (const [bx, by, br] of blobs) {
      const gr = ctx.createRadialGradient(bx * w, by * w, 0, bx * w, by * w, br * w);
      gr.addColorStop(0, 'rgba(11,26,18,0.55)');
      gr.addColorStop(0.6, 'rgba(11,26,18,0.4)');
      gr.addColorStop(1, 'rgba(11,26,18,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, w, w);
    }
  });
}

// Birds: perched dot, and three wing frames for flight (pointing up = north).
function birdTextures(scene) {
  canvasTexture(scene, 'amb_bird_perch', 16, 16, (ctx) => {
    ctx.fillStyle = '#2b2722';
    ctx.beginPath(); ctx.ellipse(8, 9, 3.6, 4.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5a4a3a';
    ctx.beginPath(); ctx.arc(8, 5, 2.4, 0, Math.PI * 2); ctx.fill();
  });
  for (let f = 0; f < 3; f++) {
    canvasTexture(scene, `amb_bird_fly${f}`, 32, 32, (ctx) => {
      const span = [15, 12, 9][f];
      const back = [2, 7, 11][f];
      ctx.strokeStyle = '#24201c';
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(16 - span, 14 + back);
      ctx.quadraticCurveTo(16 - span * 0.45, 12, 16, 15);
      ctx.quadraticCurveTo(16 + span * 0.45, 12, 16 + span, 14 + back);
      ctx.stroke();
      ctx.fillStyle = '#24201c';
      ctx.beginPath(); ctx.ellipse(16, 16, 2, 4, 0, 0, Math.PI * 2); ctx.fill();
    });
  }
}

function carTexture(scene, color) {
  return bake(scene, `amb_car_${color.toString(16)}`, 2.4, 5, (g) => drawCar(g, color));
}

function carShadowTexture(scene) {
  return bake(scene, 'amb_car_shadow', 2.4, 5, (g) => drawCarShadow(g));
}

const COW_LOOKS = 4;
// Leg frames: 0 standing, 1 and 2 the two halves of a stride. `t` is the
// scene time in seconds, used to step the legs of moving animals.
function animalTexture(scene, a, t) {
  if (a.kind === 'sheep') return bake(scene, 'amb_sheep', 1.4, 2, (g) => drawSheep(g));
  const h = hashString(String(a.id));
  if (a.kind === 'horse') {
    const v = h % HORSE_LOOKS.length;
    const f = a.moving || a.running ? 1 + (Math.floor(t * (a.running ? 7 : 4) + (h % 10) / 10) % 2) : 0;
    return bake(scene, `amb_horse_${v}_${f}`, 1.8, 5, (g) => drawHorse(g, HORSE_LOOKS[v], f));
  }
  if (a.kind === 'deer') {
    const f = a.running ? 3 + (Math.floor(t * 9 + (h % 10) / 10) % 2) : (a.moving ? 1 + (Math.floor(t * 5) % 2) : 0);
    return bake(scene, `amb_deer_${f}`, 1.4, 3.6, (g) => drawDeer(g, f));
  }
  const v = h % COW_LOOKS;
  return bake(scene, `amb_cow_${v}`, 1.6, 3.6, (g) => drawCow(g, v));
}

// Shadow ellipse size [w, l] under each kind of animal.
const ANIMAL_SHADOW = { sheep: [1.3, 1.7], cow: [1.5, 2.8], horse: [1.3, 3.4], deer: [0.9, 2.0] };

function personTexture(scene, l, index) {
  // drawLocal draws a shadow too; it goes into a throwaway Graphics.
  return bake(scene, `amb_person_${index}`, 4, 7, (g) => {
    const junk = scene.make.graphics({}, false);
    drawLocal(junk, g, { ...l, x: 0, y: 0 }, index);
    junk.destroy();
  });
}

// ---------- animal shapes (origin, facing north) ----------

function drawSheep(g) {
  g.fillStyle(0xd9d6cc, 1);
  g.fillEllipse(0, 0.1, 1.0, 1.35);
  g.fillStyle(0xf2efe6, 1);
  for (let i = 0; i < 7; i++) {
    const t = (i / 7) * Math.PI * 2;
    g.fillCircle(Math.cos(t) * 0.34, 0.1 + Math.sin(t) * 0.48, 0.26);
  }
  g.fillCircle(0.05, 0.05, 0.36);
  g.fillStyle(0x2a2622, 1);
  g.fillEllipse(0, -0.72, 0.36, 0.46);
}

function drawCow(g, look) {
  const rng = makeRng(look * 977 + 5);
  g.fillStyle(0xf0ede4, 1);
  g.fillEllipse(0, 0.15, 1.2, 2.2);
  g.fillStyle(0x1e1c1a, 1);
  for (let i = 0; i < 3; i++) {
    g.fillEllipse((rng() - 0.5) * 0.6, (rng() - 0.4) * 1.5, 0.35 + rng() * 0.35, 0.4 + rng() * 0.5);
  }
  g.fillStyle(look % 2 ? 0x1e1c1a : 0xece8de, 1);
  g.fillEllipse(0, -1.15, 0.6, 0.7);
  g.fillStyle(0xd9a8a0, 1);
  g.fillEllipse(0, -1.42, 0.4, 0.22);
  g.fillStyle(0xd8d2c2, 1);
  g.fillCircle(-0.3, -1.05, 0.08);
  g.fillCircle(0.3, -1.05, 0.08);
  g.lineStyle(0.08, 0x2a2622, 1);
  g.lineBetween(0, 1.25, 0.12, 1.6);
}

// Horse coats: brown, chestnut, grey, bay. [coat, mane and tail, legs]
const HORSE_LOOKS = [[0x6e4528, 0x2a1a10, 0x3a2414], [0x9a5530, 0x5a2e18, 0x6a3a20], [0xa9a59d, 0x6a6660, 0x7a766e], [0x7a4a2a, 0x1e1612, 0x1e1612]];

// Legs poking out past the body. Frame 1 and 2 swap the diagonal pairs.
function drawLegs(g, color, w, fy, hy, sx, reach, frame) {
  if (!frame) return;
  g.lineStyle(w, color, 1);
  const k = frame === 1 ? 1 : -1;
  g.lineBetween(-sx, fy, -sx, fy - reach * (k > 0 ? 1 : 0.3));
  g.lineBetween(sx, fy, sx, fy - reach * (k > 0 ? 0.3 : 1));
  g.lineBetween(-sx, hy, -sx, hy + reach * (k > 0 ? 0.3 : 1));
  g.lineBetween(sx, hy, sx, hy + reach * (k > 0 ? 1 : 0.3));
}

// Horse: longer and slimmer than a cow, long neck and head, dark mane and tail.
function drawHorse(g, look, frame) {
  const [coat, mane, legs] = look;
  drawLegs(g, legs, 0.18, -0.6, 1.0, 0.3, 0.75, frame);
  g.fillStyle(mane, 1);
  g.fillEllipse(0, 1.6 + (frame ? 0.1 : 0), 0.3, 0.9);
  g.fillStyle(coat, 1);
  g.fillEllipse(0, 0.65, 1.0, 1.3);
  g.fillEllipse(0, 0.05, 0.92, 1.9);
  g.fillEllipse(0, -0.45, 0.9, 1.0);
  g.fillEllipse(0, -1.05, 0.5, 1.0);
  g.fillEllipse(0, -1.62, 0.4, 0.8);
  g.fillStyle(0xffffff, 0.12);
  g.fillEllipse(0.14, 0.2, 0.42, 1.8);
  g.lineStyle(0.15, mane, 1);
  g.lineBetween(0, -0.6, 0, -1.42);
  g.fillStyle(mane, 1);
  g.fillCircle(-0.13, -1.4, 0.08);
  g.fillCircle(0.13, -1.4, 0.08);
  g.fillStyle(0x2a2622, 1);
  g.fillEllipse(0, -1.96, 0.24, 0.15);
}

// Deer: light brown, slim, white tail. Frames 3 and 4 are a bounding run:
// legs stretched fore and aft, then gathered, with the white tail up.
function drawDeer(g, frame) {
  const run = frame >= 3;
  const legs = 0x6a4a2c;
  if (run) {
    g.lineStyle(0.13, legs, 1);
    if (frame === 3) {
      g.lineBetween(-0.16, -0.45, -0.12, -1.3);
      g.lineBetween(0.16, -0.45, 0.12, -1.25);
      g.lineBetween(-0.18, 0.6, -0.14, 1.5);
      g.lineBetween(0.18, 0.6, 0.14, 1.45);
    } else {
      g.lineBetween(-0.3, -0.35, -0.42, 0.15);
      g.lineBetween(0.3, -0.35, 0.42, 0.15);
      g.lineBetween(-0.3, 0.5, -0.42, 0.0);
      g.lineBetween(0.3, 0.5, 0.42, 0.0);
    }
  } else drawLegs(g, legs, 0.12, -0.4, 0.6, 0.2, 0.45, frame);
  const head = run ? -0.12 : 0;
  g.fillStyle(0xb08355, 1);
  g.fillEllipse(0, 0.1, 0.72, 1.5);
  g.fillEllipse(0, 0.45, 0.76, 0.8);
  g.fillEllipse(0, -0.68 + head, 0.3, 0.62);
  g.fillEllipse(0, -1.02 + head, 0.3, 0.46);
  g.fillStyle(0x8f6a42, 1);
  g.fillEllipse(0, 0.05, 0.18, 1.1);
  // Ears.
  g.fillStyle(0x9a7048, 1);
  g.fillEllipse(-0.18, -0.9 + head, 0.16, 0.24);
  g.fillEllipse(0.18, -0.9 + head, 0.16, 0.24);
  g.fillStyle(0x2a2622, 1);
  g.fillCircle(0, -1.24 + head, 0.06);
  // White tail and rump patch, raised as a flag when running.
  g.fillStyle(0xf4f0e6, 1);
  g.fillEllipse(0, 0.74, 0.34, 0.24);
  g.fillEllipse(0, run ? 0.98 : 0.86, run ? 0.24 : 0.14, run ? 0.36 : 0.2);
}

// ---------- hills (one soft canvas texture per hill) ----------

const HILL_PPM = 1.5;
// Light slope toward the morning sun (ESE), shade on the far side, and faint
// contour rings so 2D players can read the ground. Returns the Images.
export function addHills(scene, world, depth) {
  const sl = Math.hypot(SUN.x, SUN.y);
  const ux = SUN.x / sl; // away from the sun (WNW)
  const uy = SUN.y / sl;
  const out = [];
  for (const hl of world.hills || []) {
    const key = `amb_hill_${hl.id}`;
    const R = hl.r * 1.08;
    const S = Math.ceil(2 * R * HILL_PPM);
    const k = Math.min(1.5, hl.h / 24);
    canvasTexture(scene, key, S, S, (ctx) => {
      const c = S / 2;
      const r = hl.r * HILL_PPM;
      const glow = (ox, oy, rr, rgb, a) => {
        const gr = ctx.createRadialGradient(c + ox, c + oy, 0, c + ox, c + oy, rr);
        gr.addColorStop(0, `rgba(${rgb},${a})`);
        gr.addColorStop(0.55, `rgba(${rgb},${a * 0.6})`);
        gr.addColorStop(1, `rgba(${rgb},0)`);
        ctx.fillStyle = gr;
        ctx.fillRect(0, 0, S, S);
      };
      glow(ux * r * 0.35, uy * r * 0.35, r * 0.8, '20,42,16', 0.2 * k);
      glow(-ux * r * 0.3, -uy * r * 0.3, r * 0.7, '255,248,205', 0.13 * k);
      const rings = Math.max(2, Math.round(hl.h / 8));
      ctx.lineWidth = 1.1;
      for (let i = 1; i <= rings; i++) {
        const rr = r * (1 - (i - 0.4) / (rings + 0.6));
        ctx.strokeStyle = `rgba(48,84,36,${0.22 + 0.04 * i})`;
        ctx.beginPath();
        for (let j = 0; j <= 48; j++) {
          const t = (j / 48) * Math.PI * 2;
          const w = 1 + 0.06 * Math.sin(3 * t + hl.x * 0.01) + 0.04 * Math.sin(5 * t + hl.y * 0.01);
          const px = c + Math.cos(t) * rr * w;
          const py = c + Math.sin(t) * rr * w * 0.92;
          if (j) ctx.lineTo(px, py);
          else ctx.moveTo(px, py);
        }
        ctx.stroke();
      }
    });
    out.push(scene.add.image(hl.x, hl.y, key).setScale(1 / HILL_PPM).setDepth(depth));
  }
  return out;
}

// ---------- image pools ----------

// Images reused frame to frame. begin(), then add() each thing to show, then
// end() hides whatever was not used this frame.
export class ImagePool {
  constructor(scene, depth) {
    this.scene = scene;
    this.depth = depth;
    this.list = [];
    this.used = 0;
  }

  begin() {
    this.used = 0;
  }

  add(key, x, y, rot = 0, scaleX = 1, scaleY = scaleX, tint = 0xffffff, alpha = 1) {
    let im = this.list[this.used];
    if (!im) {
      im = this.scene.add.image(0, 0, key).setDepth(this.depth);
      this.list.push(im);
    } else if (im.texture.key !== key) im.setTexture(key);
    im.setPosition(x, y).setRotation(rot).setScale(scaleX, scaleY).setAlpha(alpha).setVisible(true);
    if (im.tintTopLeft !== tint) im.setTint(tint);
    this.used++;
    return im;
  }

  end() {
    for (let i = this.used; i < this.list.length; i++) {
      if (this.list[i].visible) this.list[i].setVisible(false);
    }
  }
}

// Is (x, y) within the view box { x0, y0, x1, y1 } plus margin m?
export function inView(v, x, y, m = 0) {
  return x >= v.x0 - m && x <= v.x1 + m && y >= v.y0 - m && y <= v.y1 + m;
}

// All the moving ambient things, drawn with image pools by depth.
// Depths: ground objects 3, player car 10, overhead roofs 11.
export class AmbientView {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    puffTexture(scene);
    cloudTexture(scene);
    birdTextures(scene);
    carShadowTexture(scene);
    this.groundShadows = new ImagePool(scene, 2.9); // people, animals, flying birds
    this.ground = new ImagePool(scene, 3.4); // people, animals
    this.perched = new ImagePool(scene, 3.6); // birds sitting in trees
    this.carShadows = new ImagePool(scene, 8.9);
    this.dust = new ImagePool(scene, 9.3);
    this.cars = new ImagePool(scene, 9.6);
    this.smoke = new ImagePool(scene, 11.5);
    this.flying = new ImagePool(scene, 12.5);
    this.clouds = new ImagePool(scene, 13);
    this.pools = [this.groundShadows, this.ground, this.perched, this.carShadows, this.dust, this.cars, this.smoke, this.flying, this.clouds];
    this.localIndex = new Map(world.locals.map((l, i) => [l.id, i]));
  }

  draw(amb, v) {
    for (const p of this.pools) p.begin();
    const scene = this.scene;
    const R = Math.PI / 180;
    const inv = 1 / PPM;

    for (const l of this.world.locals) {
      const p = amb.personPos(l.id) || l;
      if (!inView(v, p.x, p.y, 8)) continue;
      const key = personTexture(scene, l, this.localIndex.get(l.id));
      this.groundShadows.add('amb_puff', p.x - 0.9, p.y - 0.3, 0, 1.8 / 64, 1.0 / 64, 0x000000, 0.35);
      this.ground.add(key, p.x, p.y, (p.heading || 0) * R, inv);
    }

    const t = scene.time.now / 1000;
    for (const a of amb.animals) {
      if (!inView(v, a.x, a.y, 6)) continue;
      const [sw, sl] = ANIMAL_SHADOW[a.kind] || ANIMAL_SHADOW.cow;
      this.groundShadows.add('amb_puff', a.x - 0.5, a.y - 0.17, (a.heading || 0) * R, sw / 64, sl / 64, 0x000000, 0.4);
      this.ground.add(animalTexture(scene, a, t), a.x, a.y, (a.heading || 0) * R, inv);
    }

    for (const c of amb.cars) {
      if (!inView(v, c.x, c.y, 8)) continue;
      const rot = (c.heading || 0) * R;
      this.carShadows.add('amb_car_shadow', c.x - 0.6, c.y - 0.25, rot, inv);
      this.cars.add(carTexture(scene, c.color || 0x3a6fa8), c.x, c.y, rot, inv);
    }

    for (const b of amb.birds) {
      if (!inView(v, b.x, b.y, 4)) continue;
      const rot = (b.heading || 0) * R;
      if (!b.flying) {
        this.perched.add('amb_bird_perch', b.x, b.y, rot, 0.45 / 16);
        continue;
      }
      const z = b.z || 10;
      const s = (1.1 + Math.min(0.7, z / 40)) / 32; // drawn a bit large so they read from above
      const f = b.flap ? Math.min(2, Math.floor(((Math.sin(b.flap * Math.PI * 2) + 1) / 2) * 3)) : 0;
      this.flying.add(`amb_bird_fly${f}`, b.x, b.y, rot, s);
      this.groundShadows.add('amb_puff', b.x + SUN.x * z * 0.3, b.y + SUN.y * z * 0.3, 0, 0.6 / 64, 0.6 / 64, 0x000000, 0.18);
    }

    for (const d of amb.dust) {
      if (!inView(v, d.x, d.y, 8)) continue;
      const t = Math.min(1, d.age / (d.life || 1));
      const r = (d.size || 1) * (0.7 + t * 0.6);
      this.dust.add('amb_puff', d.x, d.y, 0, (2 * r) / 64, (2 * r) / 64, 0xeee4cc, 0.65 * (1 - t));
    }

    for (const p of amb.smoke) {
      if (!inView(v, p.x, p.y, 8)) continue;
      const t = Math.min(1, p.age / (p.life || 1));
      const r = (p.size || 1) * (0.7 + t * 0.5);
      const a = 0.55 * (1 - t) * Math.min(1, p.age * 3 + 0.2);
      this.smoke.add('amb_puff', p.x, p.y, 0, (2 * r) / 64, (2 * r) / 64, 0xb8b8b8, a);
    }

    for (const c of amb.clouds) {
      const m = Math.max(c.rx, c.ry) * 1.3;
      if (!inView(v, c.x, c.y, m)) continue;
      this.clouds.add('amb_cloud', c.x, c.y, (c.angle || 0) * R, (2.3 * c.rx) / 256, (2.3 * c.ry) / 256, 0xffffff, 0.22);
    }

    for (const p of this.pools) p.end();
  }
}
