import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fold, sourceText, lineAt, locate, issueBody, issueUrl, parseIssue, hintText, URL_LIMIT } from '../src/scripts/copy-edits.js';
import { buildCopyMap } from '../src/lib/copy-map.mjs';

const mapOf = (files) => ({ files: Object.entries(files).map(([path, [raw, kind]]) => ({ path, ...sourceText(raw, kind) })) });

test('folding drops whitespace and evens out typography', () => {
  assert.equal(fold('glass—it’s  “hot”\n…'), `glass-it's"hot".`);
});

test('tags, entities and JSON escapes fall away, and lines are kept', () => {
  const { text, lines } = sourceText('<p>\n  Na<sub>2</sub>O &amp; lime\n  <b>break</b> bridges.</p>');
  assert.equal(text, 'Na2O&limebreakbridges.');
  assert.equal(lineAt(lines, text.indexOf('break')), 3);
  assert.equal(sourceText('{"a": "say \\"hi\\" \\u00b2"}', 'json').text, '{"a":"say"hi"²"}');
});

test('Markdown emphasis, links and SmartyPants match the rendered page', () => {
  const m = mapOf({ 'c.md': ['Intro\n\nIt is **cobalt**---see [Shelby](https://x.org/a)... done', 'md'] });
  assert.deepEqual(locate(m, 'It is cobalt—see Shelby… done'), { hits: [{ file: 'c.md', line: 3 }], partial: false });
});

test('a sentence split by an expression still finds its file, flagged partial', () => {
  const m = mapOf({ 'a.astro': ['<p>The melt sits at {temp} degrees before the gather comes out.</p>', 'astro'] });
  const r = locate(m, 'The melt sits at 1180 degrees before the gather comes out.');
  assert.equal(r.partial, true);
  assert.equal(r.hits[0].file, 'a.astro');
  assert.match(hintText(r), /^partial match near a\.astro:1/);
  assert.match(hintText(locate(m, 'nothing like this anywhere at all')), /not found/);
});

test('the real tree: footer and lesson copy resolve to their files', () => {
  const map = buildCopyMap();
  assert.equal(locate(map, 'How the colors are made. Absorption curves for cobalt').hits[0].file, 'src/layouts/Base.astro');
  assert.ok(locate(map, 'Do medieval windows flow? What is the evidence?').hits.some((h) => h.file === 'src/data/lessons.json'));
  assert.ok(!map.files.some((f) => f.path.startsWith('src/data/catalog/')));
});

const edits = [
  { page: '/chapters/material/', anchor: 'glass', heading: 'Glass is a liquid that stopped', title: 'The material',
    original: 'One viscosity curve runs the studio.', rewrite: 'A single viscosity curve runs the studio.', note: '', context: 'x',
    src: { hits: [{ file: 'src/data/lessons.json', line: 28 }], partial: false } },
  { page: '/', anchor: '', heading: '', title: 'Home', original: 'Delete me please.', rewrite: '', note: 'redundant', context: '' },
];

test('an issue body reads as prose and round-trips as data', () => {
  const body = issueBody(edits, 'https://example.org/site');
  assert.match(body, /https:\/\/example\.org\/site\/chapters\/material\/#glass/);
  assert.match(body, /src\/data\/lessons\.json:28/);
  assert.match(body, /delete this text/);
  assert.match(body, /Rewrite:\n> A single viscosity curve runs the studio\./);
  assert.match(body, /not resolved yet/);
  const back = parseIssue(body);
  assert.equal(back.length, 2);
  assert.equal(back[0].rewrite, edits[0].rewrite);
  assert.deepEqual(back[0].src, [{ file: 'src/data/lessons.json', line: 28 }]);
  assert.equal(back[1].note, 'redundant');
});

test('a json fence typed into a note does not hijack parsing', () => {
  const tricky = [{ ...edits[1], note: 'try\n```json\n[1,2]\n```' }];
  assert.equal(parseIssue(issueBody(tricky, 'https://x')).length, 1);
  assert.equal(parseIssue(issueBody(tricky, 'https://x'))[0].note, tricky[0].note);
});

test('short selections still find their source', () => {
  const m = mapOf({ 'a.astro': ['<h3>Tg</h3>', 'astro'] });
  assert.equal(locate(m, 'Tg').hits.length, 0);
  assert.equal(locate(mapOf({ 'a.astro': ['<b>lehr</b>', 'astro'] }), 'lehr').hits[0].file, 'a.astro');
});

test('a short queue fits in a new-issue link with the label; a long one falls back to the clipboard', () => {
  const short = issueUrl(edits, 'https://example.org');
  assert.equal(short.fits, true);
  assert.match(short.url, /issues\/new\?labels=copy-edit&title=/);
  const sent = new URL(short.url).searchParams.get('body');
  assert.equal(sent, short.body);
  assert.equal(parseIssue(sent).length, 2);
  const long = issueUrl(Array.from({ length: 40 }, () => edits[0]), 'https://example.org');
  assert.equal(long.fits, false);
  assert.ok(long.url.length < URL_LIMIT);
  assert.equal(parseIssue(long.body).length, 40);
});
