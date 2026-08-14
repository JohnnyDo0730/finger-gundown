import { defineConfig } from 'vite';

export default defineConfig({
  // base: './' is required for Electron to load assets via file:// protocol
  base: './',
  server: {
    port: 3000,
    host: '0.0.0.0',  // Expose to all network interfaces (required for ngrok)
    open: true,
    // Allow all external hosts including ngrok tunnels
    allowedHosts: true
  },
  build: {
    outDir: 'dist'
  }
});
