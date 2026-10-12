import { defineConfig } from 'vitest/config';

// Çözücü testleri saf TypeScript; Astro ya da tarayıcı ortamı gerekmez.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
