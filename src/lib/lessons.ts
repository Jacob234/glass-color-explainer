// The lesson registry (data/lessons.json) and the links between its views. A lesson links to its
// chapter page when it has one, and otherwise to its stage on the walk (the home page).
import data from '../data/lessons.json';

export type Lesson = (typeof data.lessons)[number] & { chapter?: string; recall?: { q: string; a: string }[] };
export const LESSONS = data.lessons as Lesson[];
export const STEPS = data.steps;
export const STRANDS = data.strands;
export const byId = Object.fromEntries(LESSONS.map((l) => [l.id, l])) as Record<string, Lesson>;

const base = import.meta.env.BASE_URL.replace(/\/$/, '');
export const walkHref = (l: Lesson) => `${base}/#${l.id}`;
export const chapterHref = (l: Lesson) => (l.chapter ? `${base}/chapters/${l.chapter}/` : walkHref(l));
export const essayHref = (slug: string) => `${base}/concepts/${slug}/`;
export const labHref = (slug: string) => `${base}/${slug}/`;
