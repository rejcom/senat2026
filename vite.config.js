import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const page = (f) => fileURLToPath(new URL(f, import.meta.url));

// base './' = web funguje z libovolného podadresáře (GitHub Pages, sdílená složka, ...)
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    rollupOptions: { input: { main: page('./index.html'), vysilani: page('./vysilani.html'), vyslovnost: page('./vyslovnost.html') } },
  },
});
