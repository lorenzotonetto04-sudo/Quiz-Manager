import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// "base" deve coincidere con il nome del repository GitHub
export default defineConfig({
  plugins: [react()],
base: '/Quiz-Manager/',
})
