// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// Statik çıktı: `npm run build` sonucu dist/ klasörü herhangi bir statik hostinge yüklenebilir.
export default defineConfig({
  output: 'static',
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
});
