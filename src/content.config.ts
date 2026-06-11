import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const concepts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/concepts' }),
  schema: z.object({
    title: z.string(),
    mechanism: z.enum(['anchor', 'ions', 'colloids', 'bandgap', 'structure', 'crosscutting', 'craft']),
    summary: z.string(),
    artifacts: z
      .array(z.object({ id: z.string(), title: z.string() }))
      .optional(),
    sources: z
      .array(z.object({ label: z.string(), url: z.string().url() }))
      .optional(),
  }),
});

export const collections = { concepts };
