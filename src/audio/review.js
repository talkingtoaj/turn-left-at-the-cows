// Review page (sounds.html): play every sound, mark keep / redo, copy results.
import { SOUND_GROUPS, ENGINE_LAYERS, engineMix, loadSounds, loopBounds } from './sounds.js';
import { voiceFor, VOICE_GENDER } from './voice.js';
import { NPCS } from '../world/npcs.js';
import { CRUNCH_SOUND, crunchBy, passBy } from './trafficSound.js';

const STORE = 'askalocal.soundReview.v1';
const AC = window.AudioContext || window.webkitAudioContext;
const ctx = new AC();
const out = ctx.createGain();
out.gain.value = 0.8;
out.connect(ctx.destination);

let bufs = new Map();
const playing = new Map(); // key -> { src, g, btn }

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORE)) || {};
  } catch (e) {
    return {};
  }
}
const marks = load();
// Sounds remade after a review round. Marks from an older round are dropped
// so these show up unrated again.
// SPEC 9q asks for one more pass on the player's three engine loops: round 3
// drops the old marks so they show up to be heard again (same files).
const ROUND = { 'engine/idle': 3, 'engine/mid': 3, 'engine/high': 3, 'town/murmur': 2, 'voices/f2': 2 };
const AGAIN = new Set(['engine/idle', 'engine/mid', 'engine/high']);
const roundOf = (id) => ROUND[id] || 1;
for (const id of Object.keys(marks)) if ((marks[id].round || 1) < roundOf(id)) delete marks[id];
function save() {
  try {
    localStorage.setItem(STORE, JSON.stringify(marks));
  } catch (e) {
    // storage blocked: choices last for this visit only
  }
}

const wake = () => ctx.state === 'suspended' && ctx.resume();

function stop(key) {
  const p = playing.get(key);
  if (!p) return;
  playing.delete(key);
  try {
    p.src.stop();
  } catch (e) {
    // already ended
  }
  if (p.btn) p.btn.classList.remove('on');
}

function play(key, id, { loop = false, rate = 1, btn = null, to = out } = {}) {
  wake();
  stop(key);
  const buf = bufs.get(id);
  if (!buf) return null;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  if (loop) {
    const b = loopBounds(buf);
    src.loop = true;
    src.loopStart = b.start;
    src.loopEnd = b.end;
  }
  src.connect(to);
  src.start();
  if (btn) btn.classList.add('on');
  // Voice loops on their own rows follow the pitch slider while playing.
  const p = { src, btn, voice: key === id && id.startsWith('voices/') };
  playing.set(key, p);
  src.onended = () => {
    if (playing.get(key) === p) {
      playing.delete(key);
      if (btn) btn.classList.remove('on');
    }
  };
  return src;
}

function el(tag, attrs = {}, kids = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const c of kids) e.append(c);
  return e;
}

function markControls(item, box) {
  const m = marks[item.id] || {};
  const keep = el('button', { class: 'keep', text: 'keep' });
  const redo = el('button', { class: 'redo', text: 'redo' });
  const note = el('textarea', { class: 'note', rows: 2, placeholder: 'What is wrong, or what should it sound like?' });
  note.value = m.note || '';
  function show() {
    const s = (marks[item.id] || {}).status;
    keep.classList.toggle('sel', s === 'keep');
    redo.classList.toggle('sel', s === 'redo');
    box.classList.toggle('keep', s === 'keep');
    box.classList.toggle('redo', s === 'redo');
  }
  function set(status) {
    const cur = marks[item.id] || {};
    marks[item.id] = { ...cur, status: cur.status === status ? undefined : status, round: roundOf(item.id) };
    save();
    show();
  }
  keep.addEventListener('click', () => set('keep'));
  redo.addEventListener('click', () => set('redo'));
  note.addEventListener('input', () => {
    marks[item.id] = { ...(marks[item.id] || {}), note: note.value, round: roundOf(item.id) };
    save();
  });
  show();
  return { buttons: [keep, redo], note };
}

function itemRow(item, extra) {
  const box = el('div', { class: 'item' });
  const playBtn = el('button', { text: item.kind === 'loop' ? 'Loop' : 'Play' });
  playBtn.addEventListener('click', () => {
    if (item.kind === 'loop' && playing.has(item.id)) return stop(item.id);
    play(item.id, item.id, { loop: item.kind === 'loop', btn: playBtn, rate: extra && extra.rate ? extra.rate() : 1 });
  });
  const mc = markControls(item, box);
  box.append(el('div', { class: 'row' }, [
    el('div', { class: 'name' }, [el('b', { text: item.label + (AGAIN.has(item.id) ? ' (listen again, 9q pass)' : roundOf(item.id) > 1 ? ` (new, round ${roundOf(item.id)})` : '') }), el('code', { text: item.id + '.mp3' })]),
    playBtn, ...mc.buttons,
  ]));
  if (extra && extra.node) box.append(extra.node);
  box.append(mc.note);
  return box;
}

// Engine: all three layers running, blended by an RPM slider.
function engineBlock() {
  const node = el('div', { class: 'ctl' });
  const slider = el('input', { type: 'range', min: 850, max: 5500, step: 10, value: 850 });
  const label = el('span', { text: '850 rpm' });
  const mixText = el('span', { class: 'mix' });
  const btn = el('button', { text: 'Run engine' });
  let layers = null;
  function apply() {
    const rpm = +slider.value;
    label.textContent = `${rpm} rpm`;
    const mix = engineMix(rpm);
    mixText.textContent = ENGINE_LAYERS.map((l, i) => `${l.id.split('/')[1]} ${mix[i].gain.toFixed(2)} x${mix[i].rate.toFixed(2)}`).join('  ');
    if (!layers) return;
    mix.forEach((m, i) => {
      layers[i].g.gain.setTargetAtTime(m.gain * 0.8, ctx.currentTime, 0.05);
      layers[i].src.playbackRate.setTargetAtTime(m.rate, ctx.currentTime, 0.04);
    });
  }
  btn.addEventListener('click', () => {
    wake();
    if (layers) {
      layers.forEach((l, i) => stop('eng' + i));
      layers = null;
      btn.classList.remove('on');
      return;
    }
    layers = ENGINE_LAYERS.map((l, i) => {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(out);
      const src = play('eng' + i, l.id, { loop: true, to: g });
      return { g, src };
    });
    if (layers.some((l) => !l.src)) {
      layers = null;
      return;
    }
    playing.set('eng-btn', { src: { stop: () => { layers = null; btn.classList.remove('on'); } }, btn });
    btn.classList.add('on');
    apply();
  });
  slider.addEventListener('input', apply);
  node.append(btn, el('span', { text: 'RPM' }), slider, label, mixText);
  apply();
  const box = el('div', { class: 'item' }, [
    el('div', { class: 'row' }, [el('div', { class: 'name' }, [
      el('b', { text: 'Engine blend (as in the game)' }),
      el('code', { text: 'Idle 850, shifts happen around 5000 rpm. Layers sit at 900 / 2000 / 3600 rpm. Mark the layers below.' }),
    ])]),
    node,
  ]);
  return box;
}

// Traffic: a truck or a car driving past you, as in the game (the same
// rules: level, pan, highs, pitch with speed and the Doppler drop).
function passByBlock() {
  const node = el('div', { class: 'ctl' });
  const speed = el('input', { type: 'range', min: 5, max: 25, step: 1, value: 20 });
  const label = el('span', { text: '20 m/s' });
  speed.addEventListener('input', () => (label.textContent = `${speed.value} m/s`));
  // #49: on a dirt road its tires crunch gravel too.
  const dirt = el('input', { type: 'checkbox' });
  const btns = [
    ['A truck goes by', 'traffic/diesel', 'diesel', 'pickup'],
    ['A car goes by', 'traffic/petrol', 'petrol', 'sedan'],
  ].map(([text, id, kind, vid]) => {
    const btn = el('button', { text });
    btn.addEventListener('click', () => {
      stop('pass');
      stop('passCrunch');
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      const pan = ctx.createStereoPanner();
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(lp).connect(pan).connect(out);
      const src = play('pass', id, { loop: true, btn, to: g });
      if (!src) return;
      // You stand 6 m from the road facing it; it drives left to right.
      const ear = { x: 0, y: 0, heading: 0 };
      const v = { id: vid, x: -160, y: -6, heading: 90, speed: +speed.value };
      v.onDirt = dirt.checked;
      let crunch = null;
      if (v.onDirt) {
        const c = { lp: ctx.createBiquadFilter(), hp: ctx.createBiquadFilter(), pan: ctx.createStereoPanner(), g: ctx.createGain() };
        c.lp.type = 'lowpass';
        c.hp.type = 'highpass';
        c.hp.frequency.value = 300;
        c.g.gain.value = 0;
        c.g.connect(c.hp).connect(c.lp).connect(c.pan).connect(out);
        c.src = play('passCrunch', CRUNCH_SOUND, { loop: true, to: c.g });
        if (c.src) crunch = c;
      }
      const t0 = ctx.currentTime;
      const timer = setInterval(() => {
        v.x = -160 + (ctx.currentTime - t0) * v.speed;
        if (crunch) {
          const q = crunchBy(ear, 0, v);
          crunch.g.gain.setTargetAtTime(q.gain * 2 * (0.8 + Math.random() * 0.35), ctx.currentTime, 0.05);
          crunch.src.playbackRate.setTargetAtTime(q.rate, ctx.currentTime, 0.05);
          crunch.lp.frequency.setTargetAtTime(q.lowpass, ctx.currentTime, 0.05);
          crunch.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, q.pan)), ctx.currentTime, 0.05);
        }
        const p = passBy(ear, 0, v, kind);
        g.gain.setTargetAtTime(p.gain * 2, ctx.currentTime, 0.05);
        src.playbackRate.setTargetAtTime(p.rate, ctx.currentTime, 0.05);
        lp.frequency.setTargetAtTime(p.lowpass, ctx.currentTime, 0.05);
        pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, p.pan)), ctx.currentTime, 0.05);
        if (v.x > 160 || !playing.has('pass')) {
          clearInterval(timer);
          stop('pass');
          stop('passCrunch');
        }
      }, 30);
    });
    return btn;
  });
  node.append(...btns, el('span', { text: 'Speed' }), speed, label, el('label', {}, [dirt, el('span', { text: ' Dirt road (tires crunch)' })]));
  return el('div', { class: 'item' }, [
    el('div', { class: 'name' }, [
      el('b', { text: 'Pass-by (as in the game)' }),
      el('code', { text: 'You stand 6 m from the road; it drives past left to right. Mark the loops below.' }),
    ]),
    node,
  ]);
}

function voiceExtra() {
  const node = el('div', { class: 'ctl' });
  const slider = el('input', { type: 'range', min: 0.8, max: 1.25, step: 0.01, value: 1 });
  const label = el('span', { text: 'pitch x1.00' });
  slider.addEventListener('input', () => {
    label.textContent = `pitch x${(+slider.value).toFixed(2)}`;
    for (const [, p] of playing) if (p.voice) p.src.playbackRate.setTargetAtTime(+slider.value, ctx.currentTime, 0.03);
  });
  node.append(el('span', { text: 'Pitch' }), slider, label);
  return { node, rate: () => +slider.value };
}

function localsBlock() {
  const rows = NPCS.map((n) => {
    const v = voiceFor(n.id);
    const btn = el('button', { text: 'Play' });
    btn.addEventListener('click', () => {
      if (playing.has('npc')) {
        const was = playing.get('npc').btn;
        stop('npc');
        if (was === btn) return;
      }
      play('npc', v.id, { loop: true, rate: v.rate, btn });
    });
    return el('tr', {}, [
      el('td', { text: n.name }), el('td', { text: n.role }),
      el('td', { text: `${v.id.split('/')[1]}${VOICE_GENDER[n.id] ? '' : ' (guessed)'}` }),
      el('td', { text: `x${v.rate.toFixed(2)}` }), el('td', {}, [btn]),
    ]);
  });
  return el('div', { class: 'item' }, [
    el('div', { class: 'name' }, [el('b', { text: 'Each local\'s voice' }), el('code', { text: 'Voice and fixed pitch picked from a hash of their id.' })]),
    el('table', {}, [el('tr', {}, ['Local', 'Role', 'Voice', 'Pitch', ''].map((t) => el('th', { text: t }))), ...rows]),
  ]);
}

function build() {
  const list = document.getElementById('list');
  for (const g of SOUND_GROUPS) {
    list.append(el('h2', { text: g.group }));
    if (g.group === 'Engine') list.append(engineBlock());
    if (g.group === 'Traffic') list.append(passByBlock());
    let extra = null;
    if (g.group === 'Voices') {
      extra = voiceExtra();
      list.append(localsBlock());
    }
    for (const item of g.items) {
      const row = itemRow(item, extra && { rate: extra.rate });
      list.append(row);
    }
    if (extra) list.append(el('div', { class: 'item' }, [el('b', { text: 'Voice pitch (applies to the voice loops above)' }), extra.node]));
  }
}

document.getElementById('stopall').addEventListener('click', () => {
  for (const k of [...playing.keys()]) stop(k);
});

document.getElementById('copy').addEventListener('click', async () => {
  const redo = Object.entries(marks)
    .filter(([, m]) => m.status === 'redo')
    .map(([id, m]) => ({ id, file: `public/sounds/${id}.mp3`, note: (m.note || '').trim() }));
  const kept = Object.values(marks).filter((m) => m.status === 'keep').length;
  const text = JSON.stringify({ redo, keptCount: kept, unmarked: countAll() - kept - redo.length }, null, 2);
  const status = document.getElementById('status');
  try {
    await navigator.clipboard.writeText(text);
    status.textContent = `Copied ${redo.length} redo item(s).`;
  } catch (e) {
    const ta = el('textarea', { rows: 10, style: 'width:100%' });
    ta.value = text;
    document.querySelector('.bar').after(ta);
    ta.select();
    status.textContent = 'Clipboard blocked: select and copy the text below.';
  }
});

function countAll() {
  return SOUND_GROUPS.reduce((n, g) => n + g.items.length, 0);
}

build();
const ids = SOUND_GROUPS.flatMap((g) => g.items.map((i) => i.id));
loadSounds(ctx, ids).then((m) => {
  bufs = m;
  window.__reviewLoaded = m.size;
  document.getElementById('status').textContent = `${m.size} of ${ids.length} sounds loaded.`;
});
