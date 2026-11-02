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
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
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
