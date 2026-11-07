// Talking to a local (round 12). Walk up on foot, face them and press E:
// they greet you and answer about the current job's goal at once. Names
// they mention that you can ask about (src/world/topics.js) are underlined
// with a number: click one or press 1-4 to ask. At most 4 on a page, the
// first ones mentioned. "Ask about..." opens your notebook's list of every
// name you have heard, with type-to-search. "What's that?" asks about the
// thing you are looking at. Every line goes in the notebook
// (src/game/dialogue.js), the local mumbles in their own voice
// (src/audio/voice.js) and the words show as subtitles here.
//
//   const talk = createTalk(hudRoot)
//   talk.open(npcId)                 E facing a local
//   talk.whatsThat(npcId, topicId, dir)   E looking at a landmark, a local beside you
//   talk.note(text)                  a short note card (no one to ask)
//   talk.onKey(e) -> true if used    keys while open
//   talk.close(); talk.active

import { WORLD } from '../../src/world/world.js';
import { state } from '../../src/state.js';
import {
  openTalk, ask, askWhatsThat, topicChoices, topicLabel, listTopics, getNpc,
} from '../../src/game/dialogue.js';
import { speak } from '../../src/audio/voice.js';

const CSS = `
.talk { position: absolute; left: 50%; bottom: calc(var(--hud-dash-h) + 14px); transform: translateX(-50%);
  width: min(780px, calc(100% - 32px)); padding: 14px 20px 12px; background: rgba(35,37,42,0.96); border: 2px solid #6b6e74;
  border-radius: 10px; box-shadow: 4px 4px 0 rgba(0,0,0,0.3); pointer-events: auto; display: none; }
.talk-name { color: #e6b450; font-weight: bold; font-size: 16px; margin-bottom: 6px; }
.talk-q { color: #a9acb2; font-style: italic; font-size: 14px; margin-bottom: 6px; }
.talk-text { color: #ece7d8; font-size: 18px; line-height: 1.5; min-height: 54px; cursor: pointer; }
.talk-name-link { color: #f3d58c; text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 3px;
  cursor: pointer; border-radius: 3px; }
.talk-name-link:hover, .talk-name-link:focus-visible { background: rgba(230,180,80,0.18); outline: none; }
.talk-name-link sup { font: bold 11px "Courier New", Courier, monospace; color: #e6b450; margin-left: 2px; text-decoration: none;
  display: inline-block; }
.talk-foot { display: flex; align-items: center; gap: 10px; margin-top: 12px; flex-wrap: wrap; }
.talk-btn { font: 14px Arial, Helvetica, sans-serif; color: #ece7d8; background: #3a3c40; border: 1px solid #55585e;
  border-radius: 5px; padding: 5px 12px; cursor: pointer; }
.talk-btn:hover, .talk-btn:focus-visible { border-color: #e6b450; outline: none; }
.talk-hint { margin-left: auto; font: 12px "Courier New", Courier, monospace; color: #8a8d92; }
.talk-ask { position: absolute; left: 0; right: 0; bottom: calc(100% + 8px); padding: 12px 14px 10px; background: #f1ead6; color: #3a3128;
  border-radius: 4px; box-shadow: 0 6px 18px rgba(0,0,0,0.35); display: none; }
.talk-ask-head { font: 26px/1 Caveat, "Segoe Print", cursive; margin-bottom: 6px; }
.talk-ask-head small { font: 13px Georgia, serif; font-style: italic; color: #6b5d4c; margin-left: 8px; }
.talk-ask input { width: 100%; box-sizing: border-box; font: 16px Georgia, serif; padding: 6px 8px; border: 1px solid #b8ab90;
  border-radius: 3px; background: #fbf7ec; color: #3a3128; }
.talk-ask input:focus { outline: 2px solid #b3261e; outline-offset: 1px; }
.talk-ask ul { list-style: none; margin: 8px 0 0; padding: 0; max-height: min(240px, 34vh); overflow-y: auto; }
.talk-ask li { font: 22px/1.2 Caveat, "Segoe Print", cursive; padding: 2px 8px; border-radius: 3px; cursor: pointer; }
.talk-ask li.talk-sel { background: rgba(179,38,30,0.12); }
.talk-ask li.talk-goal::after { content: '  (your job)'; font: 12px Georgia, serif; font-style: italic; color: #6b5d4c; }
.talk-ask .talk-none { font: 14px Georgia, serif; font-style: italic; color: #6b5d4c; cursor: default; }
.talk-ask-hint { margin-top: 6px; font: 12px Georgia, serif; color: #6b5d4c; }
.talk-note { position: absolute; left: 50%; top: 22%; transform: translateX(-50%) rotate(-1deg); max-width: min(460px, calc(100% - 32px));
  padding: 10px 16px; background: #f1ead6; color: #3a3128; border-radius: 3px; font: 24px/1.15 Caveat, "Segoe Print", cursive;
  box-shadow: 0 6px 14px rgba(0,0,0,0.3); pointer-events: none; opacity: 0; transition: opacity 0.4s; }
.talk-note small { display: block; font: 12px Georgia, serif; font-style: italic; color: #6b5d4c; margin-top: 4px; }
.talk-note.talk-on { opacity: 1; }
`;

function el(tag, cls, parent, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

export function createTalk(root) {
  const style = el('style', null, document.head);
  style.dataset.owner = 'talk';
  style.textContent = CSS;

  const box = el('div', 'talk', root);
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', 'Conversation');
  const nameEl = el('div', 'talk-name', box);
  const qEl = el('div', 'talk-q', box);
  const textEl = el('div', 'talk-text', box);
  textEl.setAttribute('aria-live', 'polite');
  const foot = el('div', 'talk-foot', box);
  const askBtn = el('button', 'talk-btn', foot, 'Ask about...');
  askBtn.type = 'button';
  const byeBtn = el('button', 'talk-btn', foot, 'Goodbye');
  byeBtn.type = 'button';
  const hint = el('div', 'talk-hint', foot);

  // The notebook's list of names, with search.
  const panel = el('div', 'talk-ask', box);
  const head = el('div', 'talk-ask-head', panel, 'Ask about...');
  el('small', null, head, 'names from your notebook');
  const input = el('input', null, panel);
  input.type = 'search';
  input.placeholder = 'Type to search';
  input.setAttribute('aria-label', 'Search the names you have heard');
  const list = el('ul', null, panel);
  el('div', 'talk-ask-hint', panel, 'Up/Down and Enter, or click. Esc: back.');

  const noteEl = el('div', 'talk-note', root);
  let noteTimer = 0;

  // { npcId, title, pages: [{ text, topicId, q }], page, choices }
  let d = null;
  let askOpen = false;
  let items = [];
  let sel = 0;

  function showPage() {
    const p = d.pages[d.page];
    nameEl.textContent = d.title;
    qEl.textContent = p.q || '';
    qEl.style.display = p.q ? 'block' : 'none';
    textEl.textContent = '';
    // Underline the first 4 names mentioned (not the one being answered).
    d.choices = topicChoices(p.text, p.topicId, 4, WORLD);
    let at = 0;
    d.choices.forEach((c, i) => {
      if (c.start > at) textEl.append(p.text.slice(at, c.start));
      const a = el('span', 'talk-name-link', textEl, p.text.slice(c.start, c.end));
      a.tabIndex = 0;
      a.setAttribute('role', 'button');
      a.title = `Ask about ${topicLabel(c.id)} (${i + 1})`;
      el('sup', null, a, String(i + 1));
      a.addEventListener('click', (e) => {
        e.stopPropagation();
        askTopic(c.id);
      });
      a.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          askTopic(c.id);
        }
      });
      at = c.end;
    });
    if (at < p.text.length) textEl.append(p.text.slice(at));
    // Later mentions of a chosen name, beyond the first, stay plain text.
    if (d.choices.length) state.namesShown = true;
    speak(d.npcId, p.text);
    const last = d.page === d.pages.length - 1;
    const pages = d.pages.length > 1 ? `${d.page + 1}/${d.pages.length}   ` : '';
    hint.textContent = `${pages}E: ${last ? 'goodbye' : 'next'}${d.choices.length ? `   ${d.choices.length > 1 ? `1-${d.choices.length}` : '1'}: ask` : ''}   M: map`;
  }

  function begin(npcId, pages) {
    const npc = getNpc(npcId);
    if (!npc) return;
    if (!pages.length) pages = [{ text: '...', topicId: null }];
    d = { npcId, title: `${npc.name}, ${npc.role}`, pages, page: 0, choices: [] };
    closeAsk();
    box.style.display = 'block';
    state.inputLocked = true;
    showPage();
  }

  function pagesFor(lines, topicId, q) {
    return lines.map((text, i) => ({ text, topicId, q: i === 0 ? q : null }));
  }

  function askTopic(topicId) {
    if (!d) return;
    const label = topicLabel(topicId);
    begin(d.npcId, pagesFor(ask(d.npcId, topicId, state), topicId, `You: ${label.charAt(0).toUpperCase()}${label.slice(1)}?`));
  }

  function advance() {
    if (!d) return;
    if (d.page < d.pages.length - 1) {
      d.page++;
      showPage();
    } else close();
  }

  function close() {
    if (!d) return;
    d = null;
    closeAsk();
    speak(null);
    box.style.display = 'none';
    state.namesShown = false;
    state.inputLocked = false;
  }

  // ---------------------------------------------------------------- ask about...
  function renderList() {
    const q = input.value.trim().toLowerCase();
    const all = listTopics(d.npcId, state);
    items = q ? all.filter((t) => t.label.toLowerCase().includes(q)) : all;
    sel = Math.min(sel, Math.max(0, items.length - 1));
    list.textContent = '';
    if (!items.length) el('li', 'talk-none', list, q ? 'No name like that in your notebook.' : 'No names yet.');
    items.forEach((t, i) => {
      const li = el('li', (t.isGoal ? 'talk-goal' : '') + (i === sel ? ' talk-sel' : ''), list, t.label);
      li.addEventListener('mousedown', (e) => e.preventDefault()); // keep the input focused
      li.addEventListener('click', () => pickItem(i));
      li.addEventListener('mousemove', () => {
        if (sel !== i) {
          sel = i;
          markSel();
        }
      });
    });
  }

  function markSel() {
    [...list.children].forEach((li, i) => li.classList.toggle('talk-sel', i === sel));
    const li = list.children[sel];
    if (li && li.scrollIntoView) li.scrollIntoView({ block: 'nearest' });
  }

  function pickItem(i) {
    const t = items[i];
    if (!t) return;
    closeAsk();
    askTopic(t.id);
  }

  function openAsk() {
    if (!d) return;
    askOpen = true;
    sel = 0;
    input.value = '';
    panel.style.display = 'block';
    renderList();
    input.focus({ preventScroll: true });
  }

  function closeAsk() {
    if (!askOpen) return;
    askOpen = false;
    panel.style.display = 'none';
    if (document.activeElement === input) input.blur();
  }

  input.addEventListener('input', () => {
    sel = 0;
    renderList();
  });
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      closeAsk();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pickItem(sel);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (items.length) sel = (sel + (e.key === 'ArrowUp' ? items.length - 1 : 1)) % items.length;
      markSel();
    }
  });

  askBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (askOpen) closeAsk();
    else openAsk();
  });
  byeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    close();
  });
  textEl.addEventListener('click', () => advance());
  panel.addEventListener('click', (e) => e.stopPropagation());

  return {
    get active() {
      return !!d;
    },
    get asking() {
      return askOpen;
    },
    open(npcId) {
      begin(npcId, openTalk(npcId, state));
      // The answer about the goal starts on the page after the greeting.
      const g = d && d.pages.findIndex((p) => p.topicId);
      if (d && g > 0) {
        const label = topicLabel(d.pages[g].topicId);
        d.pages[g].q = `You: ${label.charAt(0).toUpperCase()}${label.slice(1)}?`;
      }
    },
    whatsThat(npcId, topicId, dir) {
      begin(npcId, pagesFor(askWhatsThat(npcId, topicId, state), topicId, `You: What's that? (pointing ${dir})`));
    },
    // A note card for a moment (a note to yourself, no one to ask).
    note(text, small = 'in your notebook') {
      noteEl.textContent = text;
      if (small) el('small', null, noteEl, small);
      noteEl.classList.add('talk-on');
      clearTimeout(noteTimer);
      noteTimer = setTimeout(() => noteEl.classList.remove('talk-on'), 3200);
    },
    close,
    // Keys while a conversation is open. Returns true if the key was used.
    onKey(e) {
      if (!d) return false;
      const k = e.key;
      if (k === 'Escape') {
        if (askOpen) closeAsk();
        else close();
        return true;
      }
      if (e.repeat) return true;
      if (/^[1-4]$/.test(k)) {
        const c = d.choices[Number(k) - 1];
        if (c) askTopic(c.id);
        return true;
      }
      if (k === 'e' || k === 'E' || k === 'Enter' || k === ' ') {
        advance();
        return true;
      }
      if (k === 'a' || k === 'A') {
        openAsk();
        e.preventDefault();
        return true;
      }
      return false;
    },
  };
}
