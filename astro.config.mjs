// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// Statik çıktı: `npm run build` sonucu dist/ klasörü herhangi bir statik hostinge yüklenebilir.
// Site GitHub Pages'te https://thejarrus.github.io/devre-simulatoru/ adresinde yayımlanır; bu yüzden
// `base` depo adıdır. Bir alan adının kök dizinine yüklerken `site` ve `base` satırlarını değiştir
// (bkz. README → Yayın).
export default defineConfig({
  site: 'https://thejarrus.github.io',
  base: '/devre-simulatoru',
  output: 'static',
  integrations: [react()],
  // Geliştirme araç çubuğu tuvalin alt kenarını kapattığı için kapalı.
  devToolbar: { enabled: false },
  vite: {
    plugins: [tailwindcss()],
  },
});
