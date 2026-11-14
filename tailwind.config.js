/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#134e5e', dark: '#0e3b47', light: '#e6f0f2' },
      },
    },
  },
  plugins: [],
}
