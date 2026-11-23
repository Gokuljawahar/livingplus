import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],

  server: {
    proxy: {
      '/api': { target: process.env.VITE_PROXY_TARGET || 'http://localhost:4000', changeOrigin: true, ws: true },
    },
    allowedHosts: [
      '.livingplus.com',
      '.localhost',
      'livingplus.com',
      'www.livingplus.com',
      '.stitchtree.in',
      'stitchtree.in',
      'www.stitchtree.in'
    ]
  },

  preview: {
    allowedHosts: [
      '.livingplus.com',
      '.localhost',
      'livingplus.com',
      'www.livingplus.com',
      '.stitchtree.in',
      'stitchtree.in',
      'www.stitchtree.in'
    ]
  }
})
