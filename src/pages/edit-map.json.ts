// Source map for edit mode (see src/lib/copy-map.mjs). Nothing links here; the
// editor fetches it only after edit mode is switched on.
import { buildCopyMap } from '../lib/copy-map.mjs';

export function GET() {
  return new Response(JSON.stringify(buildCopyMap()), { headers: { 'Content-Type': 'application/json' } });
}
