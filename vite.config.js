import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

// The admin portal. Port 5174 so it runs beside the website (5173).
export default defineConfig({
  plugins: [react()],
  server: { port: 5174 },
  preview: { port: 5174 },
  // Sent as appVersion in every secure-gateway request header (src/api/gateway.js).
  define: { __APP_VERSION__: JSON.stringify(version) },
})
