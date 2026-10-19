// library.js — status of each source in the datasheet library (src/data/library.json).
// Pure functions only: no DOM, no file system. The caller passes `read(path)`, which returns a
// file's text or null, so the page (at build) and the tests share one rule.
//
// A source is "in use" when some file that cites it is on this tree and still contains the text
// that cites it; "on a PR" when its only uses are in pull requests not yet merged; "wanted" when
// nothing uses it yet. Status is worked out from the files themselves, so it flips on its own
// when a PR merges and cannot claim a citation the code no longer makes.

export const KINDS = {
  datasheet: 'Datasheet',
  standard: 'Standard table',
  database: 'Database',
  measurement: 'Measurement',
  method: 'Method',
  catalogue: 'Supplier catalogue',
};

// Reuse terms, from most to least open. `copy` means numbers or files may be copied into the
// repo with attribution; `cite` means facts may be used and cited but files are not rehosted.
export const REUSE = {
  open: 'Open licence: data may be copied with attribution',
  cite: 'Cite and link; do not rehost',
  unknown: 'Terms not stated; link only',
};

// One use: { file, find, stage, pr? }. `find` is the text in `file` that makes the citation.
export function useStatus(use, read) {
  const text = read(use.file);
  if (text != null && text.includes(use.find)) return { state: 'main' };
  if (use.pr) return { state: 'pr', pr: use.pr };
  return { state: 'missing' };
}

export function sourceStatus(source, read) {
  const uses = (source.usedBy ?? []).map((u) => ({ ...u, ...useStatus(u, read) }));
  const state = uses.length === 0 ? 'wanted'
    : uses.some((u) => u.state === 'main') ? 'main'
    : uses.some((u) => u.state === 'pr') ? 'pr'
    : 'missing';
  const prs = [...new Set(uses.filter((u) => u.state === 'pr').map((u) => u.pr))].sort((a, b) => a - b);
  return { state, uses, prs };
}

// Errors in the library file itself; an empty list means it is sound. `read` checks that every
// use without a PR is really on this tree, so a citation removed from the code fails the check.
export function validateLibrary(lib, read) {
  const errors = [];
  const ids = new Set();
  for (const s of lib.sources) {
    const at = `source ${s.id ?? '(no id)'}`;
    if (!s.id || !/^[a-z0-9-]+$/.test(s.id)) errors.push(`${at}: id must be lower-case kebab`);
    if (ids.has(s.id)) errors.push(`${at}: duplicate id`);
    ids.add(s.id);
    for (const k of ['title', 'by', 'date', 'url', 'provides', 'kind', 'reuse', 'licence', 'checked']) {
      if (!s[k]) errors.push(`${at}: missing ${k}`);
    }
    if (s.url && !/^https?:\/\//.test(s.url)) errors.push(`${at}: url must be a web address`);
    if (s.kind && !KINDS[s.kind]) errors.push(`${at}: unknown kind "${s.kind}"`);
    if (s.reuse && !REUSE[s.reuse]) errors.push(`${at}: unknown reuse "${s.reuse}"`);
    if (s.checked && !/^\d{4}-\d{2}-\d{2}$/.test(s.checked)) errors.push(`${at}: checked must be YYYY-MM-DD`);
    for (const u of s.usedBy ?? []) {
      if (!u.file || !u.find || !u.stage) errors.push(`${at}: each use needs file, find and stage`);
      else if (useStatus(u, read).state === 'missing') errors.push(`${at}: "${u.find}" not found in ${u.file} (add pr if it is on a pull request)`);
    }
  }
  for (const g of lib.gaps ?? []) {
    for (const id of g.candidates ?? []) if (!ids.has(id)) errors.push(`gap ${g.id}: unknown candidate "${id}"`);
  }
  return errors;
}
