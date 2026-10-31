import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';

export default defineConfig({
  site: 'https://howglassworks.fyi',
  base: '/',
  integrations: [svelte()],
});
