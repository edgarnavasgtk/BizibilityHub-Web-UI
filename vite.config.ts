import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  server: {
    port: 5173,
    proxy: {
      // All .NET MVC + API routes proxied to backend
      '/Account':        { target: 'https://localhost:7001', changeOrigin: true, secure: false },
      '/Dashboard':      { target: 'https://localhost:7001', changeOrigin: true, secure: false },
      '/MainDashboard':  { target: 'https://localhost:7001', changeOrigin: true, secure: false },
      '/Transactions':   { target: 'https://localhost:7001', changeOrigin: true, secure: false },
      '/Reports':        { target: 'https://localhost:7001', changeOrigin: true, secure: false },
      '/Admin':          { target: 'https://localhost:7001', changeOrigin: true, secure: false },
      '/api':            { target: 'https://localhost:7001', changeOrigin: true, secure: false },
    },
  },
})
