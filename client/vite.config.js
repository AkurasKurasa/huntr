import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves the site from /<repo-name>/, so production builds need that base path.
// Override with VITE_BASE (e.g. "/" for a custom domain or a <user>.github.io repo).
export default defineConfig(({ command }) => ({
  base: command === 'build' ? process.env.VITE_BASE || '/huntr/' : '/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:5000'
    }
  }
}));
