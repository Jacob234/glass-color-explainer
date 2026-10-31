// Edit mode: select any text on the site, type a rewrite, and the edits queue in
// this browser until they leave as one GitHub issue. Loaded only when edit mode is
// on (?edit, or Alt+Shift+E; see the loader in Base.astro). Everything it draws
// lives in one shadow root, and nothing on the page itself is changed: queued
// edits are marked with the CSS Custom Highlight API where the browser has it.
import { fold, foldChar, locate, hintText, issueUrl, issueTitle } from './copy-edits.js';

const STORE = 'hgw-copy-edits';
const MODE = 'hgw-edit-mode';
const base = import.meta.env.BASE_URL.replace(/\/$/, '');
const SITE = `https://jacob234.github.io${base}`;
const BLOCK = 'p, li, h1, h2, h3, h4, h5, h6, td, th, dt, dd, figcaption, blockquote, summary, label, caption, button, a';

const load = () => { try { return JSON.parse(localStorage.getItem(STORE)) || []; } catch { return []; } };
const save = (edits) => { try { localStorage.setItem(STORE, JSON.stringify(edits)); } catch {} };
const page = () => location.pathname.slice(base.length) || '/';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let mapPromise;
const sourceMap = () => (mapPromise ??= fetch(`${base}/edit-map.json`).then((r) => r.json()).catch(() => null));

const STYLE = `
:host { all: initial; }
* { box-sizing: border-box; }
.bar { position: fixed; z-index: 2147483000; right: max(12px, env(safe-area-inset-right)); bottom: max(12px, env(safe-area-inset-bottom));
  display: flex; align-items: center; gap: 0.4rem; padding: 0.4rem 0.4rem 0.4rem 0.8rem; background: #fafaf8; color: var(--ink, #141414);
  border: 1px solid var(--ink, #141414); font: 500 0.7rem/1 var(--mono, ui-monospace, monospace); letter-spacing: 0.08em; text-transform: uppercase;
  box-shadow: 0 2px 0 var(--ink, #141414); }
.bar .tag { white-space: nowrap; }
button { font: inherit; letter-spacing: inherit; text-transform: inherit; color: var(--ink, #141414); background: #fafaf8;
  border: 1px solid var(--ink, #141414); padding: 0.55rem 0.7rem; min-height: 36px; cursor: pointer; }
button.primary { background: var(--ink, #141414); color: #fafaf8; }
button:disabled { opacity: 0.35; cursor: default; }
button.link { border: 0; padding: 0.55rem 0.3rem; text-decoration: underline; text-underline-offset: 3px; }
.sheet { position: fixed; z-index: 2147483001; inset: auto 0 0 0; max-height: 88vh; overflow-y: auto; background: #fafaf8; color: var(--ink, #141414);
  border-top: 1px solid var(--ink, #141414); padding: 1rem max(16px, env(safe-area-inset-right)) max(1rem, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
  font: 15px/1.5 var(--sans, system-ui, sans-serif); box-shadow: 0 -12px 40px rgba(20, 20, 20, 0.12); }
@media (min-width: 720px) { .sheet { inset: auto max(16px, env(safe-area-inset-right)) 64px auto; width: 30rem; border: 1px solid var(--ink, #141414); } }
.sheet[hidden], .bar[hidden] { display: none; }
.k { margin: 0 0 0.35rem; font: 500 0.68rem/1.2 var(--mono, ui-monospace, monospace); letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-2, #5d605b); }
.k b { color: var(--ink, #141414); font-weight: 500; }
.was { margin: 0 0 0.9rem; padding-left: 0.8rem; border-left: 2px solid var(--ink, #141414); color: var(--ink-2, #5d605b); max-height: 9rem; overflow-y: auto; white-space: pre-wrap; }
textarea { display: block; width: 100%; margin: 0 0 0.9rem; padding: 0.6rem; border: 1px solid var(--ink, #141414); border-radius: 0; background: #fff;
  color: var(--ink, #141414); font: 16px/1.5 var(--sans, system-ui, sans-serif); resize: vertical; }
.row { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; justify-content: flex-end; font: 500 0.7rem/1 var(--mono, ui-monospace, monospace); letter-spacing: 0.08em; text-transform: uppercase; }
.row .grow { margin-right: auto; }
h2 { margin: 0 0 0.8rem; font: 400 1.6rem/1.1 var(--display, Georgia, serif); letter-spacing: -0.015em; }
ol { margin: 0 0 1rem; padding: 0; list-style: none; }
li { padding: 0.7rem 0; border-top: 1px solid var(--rule, #d6d8d2); }
li .pair { margin: 0.3rem 0; display: grid; gap: 0.25rem; }
li del { color: var(--ink-2, #5d605b); text-decoration-color: var(--ink-3, #8d908a); }
li ins { text-decoration: none; }
li .note { color: var(--ink-2, #5d605b); font-style: italic; }
li .row { justify-content: flex-start; }
li .src { font: 0.7rem/1.4 var(--mono, ui-monospace, monospace); color: var(--ink-3, #8d908a); word-break: break-all; }
.empty { color: var(--ink-2, #5d605b); }
.msg { margin: 0.6rem 0 0; font-size: 0.85rem; color: var(--ink-2, #5d605b); }
`;

export function start() {
  if (document.getElementById('copy-edit-ui')) return;
  const host = document.createElement('div');
  host.id = 'copy-edit-ui';
  document.body.append(host);
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>${STYLE}</style>
    <div class="bar" role="toolbar" aria-label="Edit mode">
      <span class="tag">Edit mode</span>
      <button class="primary" data-act="rewrite" disabled>Rewrite</button>
      <button data-act="queue">Queue <span data-count>0</span></button>
      <button class="link" data-act="exit" title="Leave edit mode (Alt+Shift+E)">Exit</button>
    </div>
    <section class="sheet" data-sheet="edit" hidden aria-label="Rewrite selection"></section>
    <section class="sheet" data-sheet="queue" hidden aria-label="Queued edits"></section>`;
  const $ = (s) => root.querySelector(s);
  const bar = $('.bar');
  const rewriteBtn = $('[data-act=rewrite]');
  const editSheet = $('[data-sheet=edit]');
  const queueSheet = $('[data-sheet=queue]');

  let edits = load();
  let picked = null;    // the last non-empty selection on the page
  let dropTimer = 0;

  const count = () => { $('[data-count]').textContent = edits.length; };

  // ---- selection ----
  const inUi = (node) => node && (node === host || host.contains(node));
  document.addEventListener('selectionchange', () => {
    const sel = document.getSelection();
    const text = sel && !sel.isCollapsed ? sel.toString().trim() : '';
    if (text && !inUi(sel.anchorNode)) {
      clearTimeout(dropTimer);
      picked = { text, range: sel.getRangeAt(0).cloneRange() };
      rewriteBtn.disabled = false;
    } else if (!text && editSheet.hidden) {
      // a tap on the button can collapse the selection first; keep it a moment
      clearTimeout(dropTimer);
      dropTimer = setTimeout(() => { picked = null; rewriteBtn.disabled = true; }, 700);
    }
  });

  const blockOf = (node) => {
    const el = node?.nodeType === 1 ? node : node?.parentElement;
    return el?.closest(BLOCK) || el;
  };
  // The nearest id at or before the selection: the anchor a reader would link to.
  const anchorOf = (node) => {
    let el = node?.nodeType === 1 ? node : node?.parentElement;
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      for (let s = e; s; s = s.previousElementSibling) {
        const inner = s !== e ? [...s.querySelectorAll('[id]')].pop() : null;
        if (inner) return inner.id;
        if (s.id && s.id !== 'copy-edit-ui') return s.id;
      }
    }
    return '';
  };
  const headingOf = (node) => {
    const all = [...document.querySelectorAll('main h1, main h2, main h3, h1, h2')];
    let last = '';
    for (const h of all) {
      if (h.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING || h.contains(node)) last = h.textContent.trim().replace(/\s+/g, ' ');
    }
    return last.slice(0, 80);
  };

  // ---- the rewrite sheet ----
  function openEdit(existing) {
    let e = existing;
    if (!e) {
      if (!picked) return;
      const node = picked.range.commonAncestorContainer;
      const block = blockOf(node);
      e = { id: Date.now().toString(36), page: page(), title: document.title.replace(/ \| How Glass Works$/, ''),
        anchor: anchorOf(node), heading: headingOf(node), original: picked.text, rewrite: picked.text, note: '',
        context: (block?.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 400) };
    }
    const fromBlock = !existing && e.context && e.context !== e.original;
    editSheet.innerHTML = `
      <p class="k"><b>Was</b> · ${esc(e.heading || e.title)}</p>
      <p class="was" data-was>${esc(e.original)}</p>
      <p class="k">Rewrite</p>
      <textarea rows="5" data-rewrite></textarea>
      <p class="k">Note <span>(optional, for whoever applies it)</span></p>
      <textarea rows="2" data-note></textarea>
      <div class="row">
        ${fromBlock ? '<button class="link grow" data-act="block">Use whole paragraph</button>' : '<span class="grow"></span>'}
        <button data-act="cancel">Cancel</button>
        <button class="primary" data-act="save">${existing ? 'Update' : 'Queue edit'}</button>
      </div>`;
    const rw = editSheet.querySelector('[data-rewrite]');
    rw.value = e.rewrite;
    editSheet.querySelector('[data-note]').value = e.note || '';
    editSheet.onclick = (ev) => {
      const act = ev.target.closest('button')?.dataset.act;
      if (act === 'block') {
        const keep = rw.value === e.original;
        e.original = e.context;
        editSheet.querySelector('[data-was]').textContent = e.original;
        if (keep) rw.value = e.original;
        ev.target.remove();
      } else if (act === 'cancel') closeSheets();
      else if (act === 'save') {
        e.rewrite = rw.value;
        e.note = editSheet.querySelector('[data-note]').value.trim();
        if (e.rewrite === e.original && !e.note) { closeSheets(); return; }
        const i = edits.findIndex((x) => x.id === e.id);
        if (i >= 0) edits[i] = e; else edits.push(e);
        save(edits); count(); mark(); closeSheets();
        picked = null; rewriteBtn.disabled = true;
        document.getSelection()?.removeAllRanges();
        resolveSource(e);
      }
    };
    queueSheet.hidden = true;
    editSheet.hidden = false;
    bar.hidden = true;
    rw.focus({ preventScroll: true });
  }

  async function resolveSource(e) {
    const map = await sourceMap();
    if (!map) return;
    e.src = locate(map, e.original);
    edits = load().map((x) => (x.id === e.id ? { ...x, src: e.src } : x));
    save(edits);
    if (!queueSheet.hidden) renderQueue();
  }

  // ---- the queue ----
  function renderQueue(msg = '') {
    const items = edits.map((e) => `
      <li data-id="${e.id}">
        <p class="k">${esc(e.page)}${e.anchor ? `#${esc(e.anchor)}` : ''}</p>
        <div class="pair">
          <del>${esc(e.original)}</del>
          ${e.rewrite === e.original ? '' : `<ins>${e.rewrite.trim() ? esc(e.rewrite) : '<i>(delete)</i>'}</ins>`}
          ${e.note ? `<span class="note">${esc(e.note)}</span>` : ''}
        </div>
        <p class="src">${esc(e.src ? hintText(e.src) : 'finding source…')}</p>
        <div class="row">
          ${e.page === page() ? '<button class="link" data-act="edit">Edit</button>' : `<a class="link" href="${esc(base + e.page)}?edit${e.anchor ? `#${esc(e.anchor)}` : ''}" style="color:inherit;padding:0.55rem 0.3rem">Go to page</a>`}
          <button class="link" data-act="del">Remove</button>
        </div>
      </li>`).join('');
    queueSheet.innerHTML = `
      <h2>${edits.length ? `${edits.length} queued edit${edits.length === 1 ? '' : 's'}` : 'No edits yet'}</h2>
      ${edits.length ? `<ol>${items}</ol>` : '<p class="empty">Select any text on the page, then press Rewrite. Edits stay in this browser until you send them.</p>'}
      <div class="row">
        ${edits.length ? '<button class="link grow" data-act="clear">Clear all</button><button data-act="copy">Copy</button><button class="primary" data-act="send">Send as GitHub issue</button>' : ''}
        <button data-act="close">Close</button>
      </div>
      ${msg ? `<p class="msg">${msg}</p>` : ''}`;
  }
  queueSheet.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('button');
    if (!btn) return;
    const id = btn.closest('li')?.dataset.id;
    const act = btn.dataset.act;
    if (act === 'close') closeSheets();
    else if (act === 'del') { edits = edits.filter((e) => e.id !== id); save(edits); count(); mark(); renderQueue(); }
    else if (act === 'edit') openEdit(edits.find((e) => e.id === id));
    else if (act === 'clear') {
      if (!confirm(`Clear all ${edits.length} queued edits? Send them first if you want to keep them.`)) return;
      edits = []; save(edits); count(); mark(); renderQueue();
    } else if (act === 'copy' || act === 'send') {
      await Promise.all(edits.filter((e) => !e.src).map(resolveSource));
      edits = load();
      const out = issueUrl(edits, SITE);
      if (act === 'send' && out.fits) {
        window.open(out.url, '_blank', 'noopener');
        renderQueue('Opened a new GitHub issue with these edits. Once it is filed, Clear all.');
        return;
      }
      let copied = false;
      try { await navigator.clipboard.writeText(`${issueTitle(edits)}\n\n${out.body}`); copied = true; } catch {}
      if (act === 'send') {
        window.open(out.url, '_blank', 'noopener');
        renderQueue(copied ? 'Too long for a link, so the edits are on your clipboard. Paste them into the issue that just opened.' : 'Too long for a link and the clipboard is blocked here. Use Copy from a desktop browser.');
      } else renderQueue(copied ? 'Copied the title and body. Paste into a new issue labelled copy-edit.' : 'The clipboard is blocked here.');
    }
  });

  function closeSheets() { editSheet.hidden = true; queueSheet.hidden = true; bar.hidden = false; }

  // ---- marking queued edits on the page ----
  function mark() {
    if (!window.CSS?.highlights || typeof Highlight === 'undefined') return;
    const mine = edits.filter((e) => e.page === page());
    if (!mine.length) { CSS.highlights.delete('copy-edit'); return; }
    // fold the page's text the same way the edits were folded, keeping where each char came from
    const nodes = [];
    let text = '';
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement?.closest('script, style, #copy-edit-ui') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
    for (let n; (n = walker.nextNode());) {
      const s = n.data;
      for (let i = 0; i < s.length; i++) { const f = foldChar(s[i]); if (f) { text += f; nodes.push([n, i]); } }
    }
    const ranges = [];
    for (const e of mine) {
      const needle = fold(e.original);
      const at = needle ? text.indexOf(needle) : -1;
      if (at < 0) continue;
      const [a, ai] = nodes[at];
      const [b, bi] = nodes[at + needle.length - 1];
      const r = new Range();
      r.setStart(a, ai); r.setEnd(b, bi + 1);
      ranges.push(r);
    }
    CSS.highlights.set('copy-edit', new Highlight(...ranges));
  }
  const style = document.createElement('style');
  style.id = 'copy-edit-style';
  style.textContent = '::highlight(copy-edit) { text-decoration: underline wavy #141414; text-decoration-thickness: 1px; text-underline-offset: 4px; }';
  document.head.append(style);

  // ---- bar ----
  bar.addEventListener('click', (ev) => {
    const act = ev.target.closest('button')?.dataset.act;
    if (act === 'rewrite') openEdit();
    else if (act === 'queue') { editSheet.hidden = true; renderQueue(); queueSheet.hidden = false; bar.hidden = true; }
    else if (act === 'exit') stop();
  });
  // keep the selection alive through the tap on Rewrite
  rewriteBtn.addEventListener('pointerdown', () => clearTimeout(dropTimer));
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closeSheets(); });
  window.addEventListener('storage', (ev) => { if (ev.key === STORE) { edits = load(); count(); mark(); } });

  // sit just above the lamp bar where a page has one
  const lift = () => {
    const lb = document.querySelector('.lampbar');
    const r = lb && getComputedStyle(lb).position === 'fixed' ? lb.getBoundingClientRect() : null;
    bar.style.bottom = r && r.height ? `${Math.max(12, innerHeight - r.top + 8)}px` : '';
  };
  lift();
  addEventListener('resize', lift);
  new ResizeObserver(lift).observe(document.body);

  count();
  // islands draw after load; mark once they have
  mark();
  setTimeout(mark, 1500);
}

export function stop() {
  try { localStorage.removeItem(MODE); } catch {}
  document.getElementById('copy-edit-ui')?.remove();
  document.getElementById('copy-edit-style')?.remove();
  window.CSS?.highlights?.delete('copy-edit');
  const u = new URL(location.href);
  if (u.searchParams.has('edit')) { u.searchParams.delete('edit'); history.replaceState(null, '', u); }
}
