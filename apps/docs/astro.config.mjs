import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  integrations: [starlight({
    title: 'ah docs',
    customCss: ['./src/styles/custom.css'],
    sidebar: [{ label: 'Documentation', items: [
      { label: 'Using ah', slug: 'usage' },
      { label: 'Design guidelines', slug: 'design-guidelines' },
    ] }],
  })],
});
