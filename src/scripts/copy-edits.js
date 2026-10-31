// Edit mode's pure half: folding text so a sentence on the page can be found in
// the source that rendered it, and turning a queue of edits into one GitHub issue
// (and back). The page half is edit-ui.js; the build-time map is src/lib/copy-map.mjs.
// Apply step: docs/copy-edits.md.

export const REPO = 'Jacob234/glass-color-explainer';
export const LABEL = 'copy-edit';
export const MARK = '<!-- copy-edits v1 -->';
// GitHub refuses very long new-issue URLs; past this we copy the body instead
export const URL_LIMIT = 7500;

// One character in, at most one out: typographic quotes, dashes and the ellipsis
// fold to ASCII and whitespace drops, so "glass—it’s" on the page meets
// "glass--it's" in Markdown and a line break in an .astro file costs nothing.
const FOLD = { '’': "'", '‘': "'", '′': "'", '“': '"', '”': '"', '″': '"', '—': '-', '–': '-', '−': '-', '…': '.' };
export function foldChar(c) {
  if (/\s/.test(c)) return '';
  return FOLD[c] ?? c;
}
export const fold = (s) => Array.from(String(s), foldChar).join('');

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', minus: '−',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…', times: '×', middot: '·', deg: '°', micro: 'µ', thinsp: ' ', shy: '' };

// A source file reduced to the text a reader could see, folded, with the source
// line of every kept character recorded as breakpoints [index, line, index, line, …].
// Tags and comments drop, entities and JSON escapes decode, and in Markdown the
// emphasis marks and link targets drop and SmartyPants' -- / --- / ... apply.
export function sourceText(raw, kind = 'astro') {
  const md = kind === 'md';
  let out = '';
  const lines = [];
  let line = 1, lastLine = 0;
  const emit = (s) => {
    for (const ch of s) {
      const f = foldChar(ch);
      if (!f) continue;
      if (line !== lastLine) { lines.push(out.length, line); lastLine = line; }
      out += f;
    }
  };
  const skipTo = (i, end) => {
    const j = raw.indexOf(end, i);
    const stop = j < 0 ? raw.length : j + end.length;
    for (let k = i; k < stop; k++) if (raw[k] === '\n') line++;
    return stop;
  };
  for (let i = 0; i < raw.length;) {
    const c = raw[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === '<' && raw.startsWith('<!--', i)) { i = skipTo(i, '-->'); continue; }
    if (c === '<' && /[A-Za-z/!]/.test(raw[i + 1] || '')) { i = skipTo(i, '>'); continue; }
    if (c === '&') {
      const m = /^&(#x[0-9a-f]+|#\d+|[a-z]+);/i.exec(raw.slice(i, i + 12));
      if (m) {
        const e = m[1];
        const ch = e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENTITIES[e.toLowerCase()];
        if (ch !== undefined) { emit(ch); i += m[0].length; continue; }
      }
    }
    if (c === '\\' && kind === 'json') {
      const n = raw[i + 1];
      if (n === 'u') { emit(String.fromCharCode(parseInt(raw.slice(i + 2, i + 6), 16))); i += 6; continue; }
      if (n === 'n' || n === 't') { i += 2; continue; }
      emit(n || ''); i += 2; continue;
    }
    if (md) {
      if (c === '*' || c === '`') { i++; continue; }
      if (c === ']' && raw[i + 1] === '(') { i = skipTo(i, ')'); continue; }
      if (c === '[') { i++; continue; }
      if (raw.startsWith('---', i)) { emit('—'); i += 3; continue; }
      if (raw.startsWith('--', i)) { emit('–'); i += 2; continue; }
      if (raw.startsWith('...', i)) { emit('…'); i += 3; continue; }
    }
    emit(c);
    i++;
  }
  return { text: out, lines };
}

export function lineAt(lines, index) {
  let line = lines[1] ?? 1;
  for (let k = 0; k < lines.length; k += 2) {
    if (lines[k] > index) break;
    line = lines[k + 1];
  }
  return line;
}

// Where a piece of page text lives. Tries the whole selection, then shorter runs of
// its leading and trailing words (text spliced from {expressions} or a script only
// matches in part). Returns up to `max` hits, `partial` when only a run matched.
export function locate(map, original, max = 3) {
  const find = (needle) => {
    const hits = [];
    if (needle.length < 6) return hits;
    for (const f of map.files) {
      let at = f.text.indexOf(needle);
      while (at >= 0 && hits.length < max) {
        hits.push({ file: f.path, line: lineAt(f.lines, at) });
        at = f.text.indexOf(needle, at + 1);
      }
      if (hits.length >= max) break;
    }
    return hits;
  };
  const whole = find(fold(original));
  if (whole.length) return { hits: whole, partial: false };
  const words = String(original).trim().split(/\s+/);
  for (let n = words.length - 1; n >= 3; n--) {
    const head = find(fold(words.slice(0, n).join(' ')));
    if (head.length) return { hits: head, partial: true };
    const tail = find(fold(words.slice(-n).join(' ')));
    if (tail.length) return { hits: tail, partial: true };
  }
  return { hits: [], partial: false };
}

export function hintText(src) {
  if (!src || !src.hits?.length) return 'not found in src/ (probably written by a script at runtime; search for a phrase)';
  const at = src.hits.map((h) => `${h.file}:${h.line}`).join(', ');
  return (src.partial ? 'partial match near ' : '') + at + (src.hits.length > 1 ? ' (several matches)' : '');
}

const quote = (s) => String(s).split('\n').map((l) => `> ${l}`).join('\n');

// The issue: one readable section per edit for Jacob, then the same edits as JSON
// for the thread that applies them.
export function issueTitle(edits, date = new Date()) {
  const pages = new Set(edits.map((e) => e.page)).size;
  return `Copy edits: ${edits.length} edit${edits.length === 1 ? '' : 's'} on ${pages} page${pages === 1 ? '' : 's'} (${date.toISOString().slice(0, 10)})`;
}

export function issueBody(edits, site) {
  const parts = [MARK, `Copy edits made in edit mode on the site. To apply, follow \`docs/copy-edits.md\`.`, ''];
  edits.forEach((e, i) => {
    const url = site + e.page + (e.anchor ? `#${e.anchor}` : '');
    parts.push(`### ${i + 1}. ${e.title || e.page}${e.heading ? ` · ${e.heading}` : ''}`);
    parts.push(`Page: ${url}  `, `Source: \`${hintText(e.src)}\``, '');
    parts.push('Was:', quote(e.original), '');
    if (e.rewrite === e.original) parts.push('Rewrite: *(no change to the words, see note)*', '');
    else if (!e.rewrite.trim()) parts.push('Rewrite: *(delete this text)*', '');
    else parts.push('Rewrite:', quote(e.rewrite), '');
    if (e.note) parts.push(`Note: ${e.note}`, '');
  });
  const data = edits.map(({ page, anchor, heading, original, rewrite, note, context, src }) =>
    ({ page, anchor, heading, original, rewrite, note, context, src: src?.hits ?? [], partial: !!src?.partial }));
  parts.push('<details><summary>Edits as data</summary>', '', '```json', JSON.stringify(data, null, 1), '```', '', '</details>');
  return parts.join('\n');
}

export function parseIssue(body) {
  const m = /```json\n([\s\S]*?)\n```/.exec(body || '');
  if (!m) throw new Error('no edits block in this issue');
  return JSON.parse(m[1]);
}

export function issueUrl(edits, site, date) {
  const base = `https://github.com/${REPO}/issues/new`;
  const q = (body) => `${base}?labels=${LABEL}&title=${encodeURIComponent(issueTitle(edits, date))}` + (body ? `&body=${encodeURIComponent(body)}` : '');
  const body = issueBody(edits, site);
  const full = q(body);
  return full.length <= URL_LIMIT ? { url: full, fits: true, body } : { url: q('(Paste the copied edits here.)'), fits: false, body };
}
