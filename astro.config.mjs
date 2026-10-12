// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// Statik çıktı: `npm run build` sonucu dist/ klasörü herhangi bir statik hostinge yüklenebilir.
// Site GitHub Pages'te https://yigitkasap.github.io/devre-simulatoru/ adresinde yayımlanır; bu yüzden
// `base` depo adıdır. Bir alan adının kök dizinine yüklerken `site` ve `base` satırlarını değiştir
// (bkz. README → Yayın).
export default defineConfig({
  site: 'https://yigitkasap.github.io',
  base: '/devre-simulatoru',
  output: 'static',
  integrations: [react()],
  // Geliştirme araç çubuğu tuvalin alt kenarını kapattığı için kapalı.
  devToolbar: { enabled: false },
  vite: {
    plugins: [tailwindcss()],
    // lz-string (CommonJS) açılışta hazırlansın; sonradan keşfedilirse geliştirme sunucusu
    // yapılandırma değişikliğinden sonra "Outdated Optimize Dep" (504) verip sayfayı yükleyemiyor.
    optimizeDeps: { include: ['lz-string'] },
  },
});
