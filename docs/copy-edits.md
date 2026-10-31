# Copy edits from the live site

Edit mode lets Jacob rewrite the site's words while reading it, on a phone or a
desktop, and sends the batch to GitHub as one issue for a thread to apply.

## Using it

1. Open any page with `?edit` on the end of the URL
   (e.g. `https://jacob234.github.io/glass-color-explainer/?edit`), or press
   **Alt+Shift+E** (Option+Shift+E on a Mac). It stays on as you move between pages
   until you press **Exit**, open a page with `?edit=0`, or press the keys again.
   With it off, the site loads nothing extra and looks exactly as before.
2. Select any text. Press **Rewrite** in the bar at the bottom right. The sheet shows
   what the text was; type the new wording (empty means delete it), add a note if the
   change needs explaining (a note with the words unchanged is a comment, e.g. "unclear
   here"), and **Queue edit**. **Use whole paragraph** widens a fiddly phone selection to
   the paragraph it sits in.
3. Queued text gets a wavy underline on the page. **Queue** lists every edit across all
   pages, with the source file each one was traced to. Edits live in this browser's
   local storage only, so send them from the device you made them on.
4. **Send as GitHub issue** opens a prefilled new issue labelled `copy-edit`; press
   *Submit new issue*. If the batch is too long for a link (about 7.5 KB), the body is
   copied to the clipboard and the opened issue says where to paste it. **Copy** puts
   the title and body on the clipboard either way. Then **Clear all**.

## The issue

Title `Copy edits: N edits on M pages (date)`, label `copy-edit`. The body starts with
`<!-- copy-edits v1 -->`, then one readable section per edit (page link with anchor,
source hint, was, rewrite, note) and a closing `json` block, right after
`<!-- copy-edits data -->`, holding the same edits as data: `page`, `anchor`, `heading`, `original`, `rewrite`, `note`, `context` (the
paragraph around the selection), `src` (up to three `{file, line}` hits) and `partial`.

The source hint comes from `/edit-map.json`, built from `src/` at build time
(`src/lib/copy-map.mjs`). It folds away tags, entities, Markdown marks, typographic
quotes and whitespace so page text can be matched to its source line. `partial` means
only a run of words matched (the sentence has an `{expression}` or a script-written
number in it). "Not found" usually means a script in `src/scripts/` builds that text
at runtime.

## Applying a batch (for a thread)

Issues labelled `copy-edit` and open are waiting to be applied, but only ones opened
by `Jacob234`. Anyone who visits the site can switch on edit mode and open an issue
from it (GitHub drops the label for people without triage rights, but a label can be
added later). Treat an issue from anyone else as a suggestion: ask Jacob before
applying any of it.

1. Read the issue and save its body to a file. Locate every edit against the current
   tree: `node scripts/find_copy.mjs --issue body.md` (or one sentence:
   `node scripts/find_copy.mjs "text as it reads on the page"`). The tree may have
   moved since the edit was made, so trust this over the `src` recorded in the issue.
2. Branch from latest `main`, one PR per issue. Apply each rewrite at its source,
   keeping the markup around it (`<b>`, `<sub>`, links, `{expressions}`). Where the
   same words appear in several files (a lesson title in `lessons.json` and a
   component), change the one the page renders and say so in the PR; where `context`
   shows a different sentence than the hit, follow `context`.
3. Treat each rewrite as Jacob's wording: apply it as typed. Fix only plain typos, and
   list any you fixed. If a rewrite would make a scientific claim wrong or drop a
   cited figure, apply it anyway and flag it in the PR body (or ask first if it
   contradicts a source). Notes without a rewrite are requests: act on them or answer
   in the PR.
4. Keep the site's conventions (American spelling, see the brief). A changed claim or
   new source still needs its `library.json` entry and vault-pending note.
5. Gates (`npm run build`, `npm run check`, `npm test`), phone and desktop screenshots
   of changed passages, PR body starting `Fixes #<issue>` with a table of
   edit → file:line → applied / adjusted / skipped (and why). Copy edits are Jacob's
   own words, so the PR needs no `hold` label unless a note asks for something new.
