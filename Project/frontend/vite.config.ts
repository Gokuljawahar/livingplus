import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],

  server: {
    allowedHosts: [
      '.livingplus.com',
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
      'livingplus.com',
      'www.livingplus.com',
      '.stitchtree.in',
      'stitchtree.in',
      'www.stitchtree.in'
    ]
  }
})
