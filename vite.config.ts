import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Tauri expects a fixed port, fail if it's already in use
  server: {
    port: 1420,
    strictPort: true,
  },
  // env vars starting with `VITE_` are exposed to the client
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    // Standard ES target for modern browsers/Tauri
    target: 'es2020',
    // don't minify for debug builds
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    // produce sourcemaps for debug builds
    sourcemap: !!process.env.TAURI_DEBUG,
  },
});
