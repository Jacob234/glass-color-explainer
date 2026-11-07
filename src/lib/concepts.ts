// The concept graph (data/concepts.json): the units a reader learns, their prerequisites, and where
// the site teaches each one now. Lessons are the walk's stops; a lesson teaches several concepts.
import data from '../data/concepts.json';
import { byId as lessonById, chapterHref, labHref, type Lesson } from './lessons';

export type Concept = {
  id: string; name: string; domain: string; requires: string[]; coverage: 'covered' | 'partial' | 'none';
  taughtBy?: string[]; labs?: string[]; also?: string; alsoFile?: string; threshold?: boolean;
  sources: { write_from: string; adapt: string; link: string; data: string };
};
export const CONCEPTS = data.concepts as Concept[];
export const DOMAINS = data.domains;
export const conceptById = Object.fromEntries(CONCEPTS.map((c) => [c.id, c])) as Record<string, Concept>;

const base = import.meta.env.BASE_URL.replace(/\/$/, '');
const pageIds = new Set(Object.keys(import.meta.glob('../data/learn/*.json')).map((p) => p.split('/').pop()!.replace('.json', '')));
/** A concept with its own page links there; the rest link to their row in the atlas. */
export const hasPage = (c: Concept) => pageIds.has(c.id);
export const pageHref = (c: Concept) => `${base}/learn/${c.id}/`;
export const atlasHref = (c: Concept) => (hasPage(c) ? pageHref(c) : `${base}/atlas/#concept-${c.id}`);
/** The concepts a walk lesson teaches, in graph order. */
export const conceptsOf = (l: Lesson) => CONCEPTS.filter((c) => c.taughtBy?.includes(l.id));
/** Prerequisites of a lesson's concepts that the lesson itself does not teach. */
export const needsOf = (l: Lesson) => {
  const own = new Set(conceptsOf(l).map((c) => c.id));
  const need = new Set(conceptsOf(l).flatMap((c) => c.requires).filter((id) => !own.has(id)));
  return CONCEPTS.filter((c) => need.has(c.id));
};
export const lessonsOf = (c: Concept) => (c.taughtBy ?? []).map((id) => lessonById[id]);
export { chapterHref, labHref };
