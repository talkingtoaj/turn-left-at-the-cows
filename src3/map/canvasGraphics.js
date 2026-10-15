// A tiny stand-in for Phaser.GameObjects.Graphics that draws straight onto a
// CanvasRenderingContext2D. It covers the methods used by src/map/draw.js,
// src/map/oldMap.js and the map overlay, so that code can be reused as is.
// Colors are Phaser style numbers (0xrrggbb) with a separate alpha.

export function rgba(color, alpha = 1) {
  return `rgba(${(color >> 16) & 255},${(color >> 8) & 255},${color & 255},${alpha})`;
}

const pt = (p) => (Array.isArray(p) ? p : [p.x, p.y]);

export class CanvasGraphics {
  constructor(ctx) {
    this.ctx = ctx;
    this.lw = 1;
    this.strokeCss = 'rgba(0,0,0,1)';
    this.fillCss = 'rgba(0,0,0,1)';
  }

  lineStyle(width, color, alpha = 1) {
    this.lw = width;
    this.strokeCss = rgba(color, alpha);
    return this;
  }

  fillStyle(color, alpha = 1) {
    this.fillCss = rgba(color, alpha);
    return this;
  }

  clear() {
    return this;
  }

  doStroke() {
    const c = this.ctx;
    c.lineWidth = this.lw;
    c.strokeStyle = this.strokeCss;
    c.lineJoin = 'round';
    c.lineCap = 'butt';
    c.stroke();
  }

  doFill() {
    this.ctx.fillStyle = this.fillCss;
    this.ctx.fill();
  }

  // Path API (Phaser names).
  beginPath() { this.ctx.beginPath(); return this; }
  moveTo(x, y) { this.ctx.moveTo(x, y); return this; }
  lineTo(x, y) { this.ctx.lineTo(x, y); return this; }
  arc(x, y, r, a0, a1, anticlockwise = false) { this.ctx.arc(x, y, r, a0, a1, anticlockwise); return this; }
  closePath() { this.ctx.closePath(); return this; }
  strokePath() { this.doStroke(); return this; }
  fillPath() { this.doFill(); return this; }

  lineBetween(x1, y1, x2, y2) {
    this.ctx.beginPath();
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x2, y2);
    this.doStroke();
    return this;
  }

  polyPath(points, close) {
    const c = this.ctx;
    c.beginPath();
    points.forEach((p, i) => {
      const [x, y] = pt(p);
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    });
    if (close) c.closePath();
  }

  strokePoints(points, closeShape = false, closePath = false) {
    if (!points || points.length < 2) return this;
    this.polyPath(points, closeShape || closePath);
    this.doStroke();
    return this;
  }

  fillPoints(points) {
    if (!points || points.length < 3) return this;
    this.polyPath(points, true);
    this.doFill();
    return this;
  }

  fillRect(x, y, w, h) {
    this.ctx.fillStyle = this.fillCss;
    this.ctx.fillRect(x, y, w, h);
    return this;
  }

  strokeRect(x, y, w, h) {
    this.ctx.beginPath();
    this.ctx.rect(x, y, w, h);
    this.doStroke();
    return this;
  }

  fillCircle(x, y, r) {
    this.ctx.beginPath();
    this.ctx.arc(x, y, r, 0, Math.PI * 2);
    this.doFill();
    return this;
  }

  strokeCircle(x, y, r) {
    this.ctx.beginPath();
    this.ctx.arc(x, y, r, 0, Math.PI * 2);
    this.doStroke();
    return this;
  }

  fillTriangle(x0, y0, x1, y1, x2, y2) {
    return this.fillPoints([[x0, y0], [x1, y1], [x2, y2]]);
  }

  strokeTriangle(x0, y0, x1, y1, x2, y2) {
    return this.strokePoints([[x0, y0], [x1, y1], [x2, y2]], true);
  }

  // Phaser: (x, y) is the centre, w/h are full width/height.
  ellipsePath(x, y, w, h) {
    this.ctx.beginPath();
    this.ctx.ellipse(x, y, w / 2, h / 2, 0, 0, Math.PI * 2);
  }

  fillEllipse(x, y, w, h) { this.ellipsePath(x, y, w, h); this.doFill(); return this; }
  strokeEllipse(x, y, w, h) { this.ellipsePath(x, y, w, h); this.doStroke(); return this; }

  roundedPath(x, y, w, h, radius = 20) {
    const r = typeof radius === 'number'
      ? { tl: radius, tr: radius, br: radius, bl: radius }
      : { tl: 0, tr: 0, br: 0, bl: 0, ...radius };
    const c = this.ctx;
    c.beginPath();
    c.moveTo(x + r.tl, y);
    c.lineTo(x + w - r.tr, y);
    c.arcTo(x + w, y, x + w, y + r.tr, r.tr);
    c.lineTo(x + w, y + h - r.br);
    c.arcTo(x + w, y + h, x + w - r.br, y + h, r.br);
    c.lineTo(x + r.bl, y + h);
    c.arcTo(x, y + h, x, y + h - r.bl, r.bl);
    c.lineTo(x, y + r.tl);
    c.arcTo(x, y, x + r.tl, y, r.tl);
    c.closePath();
  }

  fillRoundedRect(x, y, w, h, radius) { this.roundedPath(x, y, w, h, radius); this.doFill(); return this; }
  strokeRoundedRect(x, y, w, h, radius) { this.roundedPath(x, y, w, h, radius); this.doStroke(); return this; }
}

// Draws text the way a Phaser Text object with setOrigin/setRotation would.
// style: { fontFamily, fontSize: '12px', fontStyle: 'bold' | 'italic', color }
export function drawText(ctx, x, y, text, style = {}, origin = [0, 0], rotation = 0, alpha = 1) {
  const size = style.fontSize || '16px';
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `${style.fontStyle || ''} ${size} ${style.fontFamily || 'sans-serif'}`.trim();
  ctx.fillStyle = style.color || '#000';
  ctx.textAlign = origin[0] === 0 ? 'left' : origin[0] === 1 ? 'right' : 'center';
  ctx.textBaseline = origin[1] === 0 ? 'top' : origin[1] === 1 ? 'bottom' : 'middle';
  ctx.translate(x, y);
  if (rotation) ctx.rotate(rotation);
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

// A fake Phaser scene + container for code that calls scene.add.graphics()
// and scene.add.text(). Graphics draw right away; texts are collected and
// drawn on top afterwards (Phaser would draw them above the single Graphics).
export function makeFakeScene(ctx) {
  const texts = [];
  const scene = {
    add: {
      graphics: () => new CanvasGraphics(ctx),
      text: (x, y, text, style) => {
        const t = {
          x, y, text, style, origin: [0, 0], rotation: 0,
          setOrigin(ox, oy = ox) { this.origin = [ox, oy]; return this; },
          setRotation(r) { this.rotation = r; return this; },
        };
        texts.push(t);
        return t;
      },
    },
  };
  const container = { add() { return this; } };
  const flushTexts = () => {
    for (const t of texts) drawText(ctx, t.x, t.y, t.text, t.style, t.origin, t.rotation);
  };
  return { scene, container, flushTexts };
}
