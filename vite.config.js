import { defineConfig } from 'vite';

export default defineConfig({
  // base: './' is required for Electron to load assets via file:// protocol
  base: './',
  server: {
    port: 3000,
    open: true
  },
  build: {
    outDir: 'dist'
  }
});
