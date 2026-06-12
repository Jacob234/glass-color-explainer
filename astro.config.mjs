import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';

export default defineConfig({
  site: 'https://jacob234.github.io',
  base: '/glass-color-explainer',
  integrations: [svelte()],
});
