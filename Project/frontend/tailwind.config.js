/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          light: '#0A3B75',
          DEFAULT: '#02224B',
          dark: '#011632',
          yellow: '#FEB109',
          'yellow-hover': '#E59E00',
          'yellow-light': '#FFF8E6',
          blue: '#02224B',
        },
        sidebar: {
          bg: '#F8FAFB',
          text: '#64748B',
          active: '#02224B',
        }
      }
    },
  },
  plugins: [],
}
