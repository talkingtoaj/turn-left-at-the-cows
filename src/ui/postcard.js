// The share postcard (#81): after a mission, a picture of the player's
// sketch and trip they can save. The sketch is drawn by the same code as the
// win screen and the map wall (src3/map/sketchRender.js); the words come from
// ./postcardFacts.js. Plain Canvas2D, no 3D, so it costs nothing while driving.
//
//   renderPostcard({ sketch, facts }) -> Promise<canvas>  (CARD_W x CARD_H px)
//   savePostcard({ sketch, facts, missionId }) -> Promise  downloads a PNG

import { renderSketchCanvas, HAND, PAPER } from '../../src3/map/sketchRender.js';
import { postcardFileName } from './postcardFacts.js';
import { TITLE } from './splash.js';

export const CARD_W = 1800;
export const CARD_H = 1200;

const CARD = '#f3ead3';
const INK = '#3a3128';
const MUTED = '#8a7d66';
const RED = '#b3261e';
const BLUE_INK = 'rgba(52, 58, 110, 0.78)';
const OSWALD = 'Oswald, "Arial Narrow", Impact, sans-serif';

const fontsReady = () => Promise.race([
  Promise.all([
    document.fonts?.load?.('64px Caveat'),
    document.fonts?.load?.('600 30px Oswald'),
  ]).catch(() => {}),
  new Promise((r) => setTimeout(r, 1500)),
]);

// Largest font size (down to min) that fits text in maxW.
function fitFont(ctx, text, weight, size, family, maxW, min = 14) {
  let s = size;
  for (; s > min; s -= 2) {
    ctx.font = `${weight} ${s}px ${family}`;
    if (ctx.measureText(text).width <= maxW) break;
  }
  return s;
}

export async function renderPostcard({ sketch, facts }) {
  await fontsReady();
  const c = document.createElement('canvas');
  c.width = CARD_W;
  c.height = CARD_H;
  const ctx = c.getContext('2d');

  // Card stock, a touch darker at the edges.
  ctx.fillStyle = CARD;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  const edge = ctx.createRadialGradient(CARD_W / 2, CARD_H / 2, CARD_H * 0.45, CARD_W / 2, CARD_H / 2, CARD_W * 0.62);
  edge.addColorStop(0, 'rgba(120, 90, 40, 0)');
  edge.addColorStop(1, 'rgba(120, 90, 40, 0.16)');
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  drawSketchPhoto(ctx, sketch);

  // Left, under the map: where you got to and the job, in pencil.
  ctx.fillStyle = INK;
  ctx.textBaseline = 'alphabetic';
  fitFont(ctx, facts.heading, 600, 76, HAND, 1060);
  ctx.fillText(facts.heading, 70, 945);
  if (facts.title) {
    fitFont(ctx, facts.title.toUpperCase(), 500, 30, OSWALD, 1060);
    ctx.fillStyle = MUTED;
    ctx.fillText(facts.title.toUpperCase(), 72, 1000);
  }

  // The postcard's middle rule.
  ctx.strokeStyle = 'rgba(58, 49, 40, 0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(1205, 90);
  ctx.lineTo(1205, 1110);
  ctx.stroke();

  drawStamp(ctx, 1548, 72, 182, 224);
  drawPostmark(ctx, 1420, 205, facts);

  // Right: the trip, written on the address lines.
  let y = 470;
  for (const [label, value] of facts.rows) {
    ctx.strokeStyle = 'rgba(58, 49, 40, 0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(1250, y + 14);
    ctx.lineTo(1730, y + 14);
    ctx.stroke();
    ctx.fillStyle = MUTED;
    ctx.font = `500 24px ${OSWALD}`;
    ctx.fillText(label.toUpperCase(), 1252, y - 6);
    ctx.fillStyle = INK;
    fitFont(ctx, value, 600, 58, HAND, 260);
    ctx.textAlign = 'right';
    ctx.fillText(value, 1726, y + 2);
    ctx.textAlign = 'left';
    y += 108;
  }

  // The game's name, small, like a printer's line.
  ctx.fillStyle = MUTED;
  ctx.font = `500 26px ${OSWALD}`;
  ctx.textAlign = 'right';
  ctx.fillText(TITLE.toUpperCase(), 1730, 1125);
  ctx.textAlign = 'left';
  return c;
}

// The player's sketch as a photo on the card: white border, a soft shadow,
// a little crooked.
function drawSketchPhoto(ctx, sketch) {
  const w = 1060;
  const h = Math.round((w * PAPER.h) / PAPER.w);
  const dpr = window.devicePixelRatio || 1;
  const img = renderSketchCanvas(sketch, w / dpr, { hint: false });
  ctx.save();
  ctx.translate(70 + w / 2, 80 + h / 2);
  ctx.rotate(-0.012);
  ctx.shadowColor = 'rgba(40, 28, 10, 0.35)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetX = 5;
  ctx.shadowOffsetY = 7;
  ctx.fillStyle = '#fbf8f0';
  ctx.fillRect(-w / 2 - 16, -h / 2 - 16, w + 32, h + 32);
  ctx.shadowColor = 'transparent';
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(-w / 2, -h / 2, w, h);
  ctx.restore();
}

// A stamp with no words: a road past a red barn under a low sun.
function drawStamp(ctx, x, y, w, h) {
  ctx.save();
  ctx.shadowColor = 'rgba(40, 28, 10, 0.25)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = '#fffdf6';
  ctx.fillRect(x, y, w, h);
  ctx.restore();
  // Perforations: bites of card colour round the edge.
  ctx.fillStyle = CARD;
  const r = 6;
  for (let px = x; px <= x + w + 0.1; px += w / 13) {
    ctx.beginPath(); ctx.arc(px, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(px, y + h, r, 0, Math.PI * 2); ctx.fill();
  }
  for (let py = y; py <= y + h + 0.1; py += h / 16) {
    ctx.beginPath(); ctx.arc(x, py, r, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + w, py, r, 0, Math.PI * 2); ctx.fill();
  }
  const ix = x + 16;
  const iy = y + 16;
  const iw = w - 32;
  const ih = h - 32;
  ctx.save();
  ctx.beginPath();
  ctx.rect(ix, iy, iw, ih);
  ctx.clip();
  const sky = ctx.createLinearGradient(0, iy, 0, iy + ih * 0.6);
  sky.addColorStop(0, '#8fb3c9');
  sky.addColorStop(1, '#f1d9a6');
  ctx.fillStyle = sky;
  ctx.fillRect(ix, iy, iw, ih);
  ctx.fillStyle = '#e8a23c';
  ctx.beginPath(); ctx.arc(ix + iw * 0.28, iy + ih * 0.42, iw * 0.13, 0, Math.PI * 2); ctx.fill();
  // Far hill, near field.
  ctx.fillStyle = '#7f9a5a';
  ctx.beginPath();
  ctx.moveTo(ix, iy + ih * 0.55);
  ctx.quadraticCurveTo(ix + iw * 0.5, iy + ih * 0.44, ix + iw, iy + ih * 0.53);
  ctx.lineTo(ix + iw, iy + ih); ctx.lineTo(ix, iy + ih); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#c9a54e';
  ctx.beginPath();
  ctx.moveTo(ix, iy + ih * 0.66);
  ctx.quadraticCurveTo(ix + iw * 0.6, iy + ih * 0.6, ix + iw, iy + ih * 0.68);
  ctx.lineTo(ix + iw, iy + ih); ctx.lineTo(ix, iy + ih); ctx.closePath(); ctx.fill();
  // The road, wide at the bottom, turning left into the distance.
  ctx.fillStyle = '#6b5d4c';
  ctx.beginPath();
  ctx.moveTo(ix + iw * 0.35, iy + ih);
  ctx.quadraticCurveTo(ix + iw * 0.62, iy + ih * 0.8, ix + iw * 0.47, iy + ih * 0.62);
  ctx.lineTo(ix + iw * 0.5, iy + ih * 0.62);
  ctx.quadraticCurveTo(ix + iw * 0.72, iy + ih * 0.8, ix + iw * 0.8, iy + ih);
  ctx.closePath();
  ctx.fill();
  // Barn: red, gambrel roof, white door cross.
  const bx = ix + iw * 0.6;
  const by = iy + ih * 0.5;
  const bw = iw * 0.27;
  const bh = ih * 0.13;
  ctx.fillStyle = RED;
  ctx.beginPath();
  ctx.moveTo(bx, by + bh);
  ctx.lineTo(bx, by);
  ctx.lineTo(bx + bw * 0.18, by - bh * 0.5);
  ctx.lineTo(bx + bw * 0.5, by - bh * 0.8);
  ctx.lineTo(bx + bw * 0.82, by - bh * 0.5);
  ctx.lineTo(bx + bw, by);
  ctx.lineTo(bx + bw, by + bh);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#f4ecd8';
  ctx.lineWidth = 2;
  const dx = bx + bw * 0.34;
  const dw = bw * 0.32;
  ctx.strokeRect(dx, by + bh * 0.15, dw, bh * 0.85);
  ctx.beginPath();
  ctx.moveTo(dx, by + bh * 0.15); ctx.lineTo(dx + dw, by + bh);
  ctx.moveTo(dx + dw, by + bh * 0.15); ctx.lineTo(dx, by + bh);
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = 'rgba(58, 49, 40, 0.25)';
  ctx.lineWidth = 1;
  ctx.strokeRect(ix, iy, iw, ih);
}

// A round postmark over the stamp's corner: the place you made it to and the
// clock, with wavy cancel lines running left.
function drawPostmark(ctx, cx, cy, facts) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.14);
  ctx.strokeStyle = BLUE_INK;
  ctx.fillStyle = BLUE_INK;
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(0, 0, 92, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, 80, 0, Math.PI * 2); ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (facts.postmark) {
    fitFont(ctx, facts.postmark.toUpperCase(), 600, 30, OSWALD, 136, 14);
    ctx.fillText(facts.postmark.toUpperCase(), 0, -20);
  }
  ctx.font = `600 34px ${OSWALD}`;
  ctx.fillText(facts.clock, 0, 24);
  ctx.restore();
  // Cancel lines.
  ctx.save();
  ctx.strokeStyle = BLUE_INK;
  ctx.lineWidth = 4;
  for (let k = 0; k < 4; k++) {
    const yy = cy - 42 + k * 28;
    ctx.beginPath();
    for (let x = cx - 110; x >= 1250; x -= 4) {
      const y2 = yy + Math.sin((x - 1250) / 26) * 7;
      if (x === cx - 110) ctx.moveTo(x, y2);
      else ctx.lineTo(x, y2);
    }
    ctx.stroke();
  }
  ctx.restore();
}

export async function savePostcard({ sketch, facts, missionId }) {
  const c = await renderPostcard({ sketch, facts });
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  if (!blob) throw new Error('postcard: no image');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = postcardFileName(missionId);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
