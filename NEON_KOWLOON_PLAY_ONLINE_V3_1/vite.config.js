import { defineConfig } from 'vite';
export default defineConfig({
  root: 'client',
  publicDir: 'public',
  build: { outDir: '../dist', emptyOutDir: true, target: 'es2022' },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/ws': {target:'ws://localhost:3000', ws:true},
      '/health': 'http://localhost:3000'
    }
  }
});
