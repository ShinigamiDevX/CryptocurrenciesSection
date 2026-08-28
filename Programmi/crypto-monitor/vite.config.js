import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        banner: '/*!\n * Cryptocurrency Seizure Monitoring System\n * Copyright © 2026 [CRISTOFORO] - All Rights Reserved\n * PROPRIETARY SOFTWARE - Unauthorized copying or distribution is strictly prohibited\n * Developed for: Arma dei Carabinieri\n */',
      }
    }
  },
  plugins: [
    react()
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'https://127.0.0.1:5173',
        changeOrigin: true,
        secure: false,
      }
    }
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.js',
    css: true,
  },
})
