import { defineConfig } from 'vite';

// base './' = web funguje z libovolného podadresáře (GitHub Pages, sdílená složka, ...)
export default defineConfig({
  base: './',
  build: { target: 'es2022' },
});
