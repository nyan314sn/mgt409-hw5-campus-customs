import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The desk runs on http://localhost:5173. The backend (FastAPI, port 8000) allows this
// origin in its CORS settings, so keep the port fixed.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
})
