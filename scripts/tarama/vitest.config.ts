import { defineConfig } from 'vitest/config';

// Tarama ve profil betikleri: `npm run tarama:motor`, `npm run profil`. Olağan testlerle (`npm test`)
// çalışmaz; uzun sürerler ve rapor yazarlar.
export default defineConfig({
  test: {
    include: ['scripts/tarama/**/*.tarama.ts'],
    environment: 'node',
    testTimeout: 3 * 60 * 60 * 1000,
  },
});
