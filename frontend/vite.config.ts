import path from 'node:path'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/** Where `make dev` serves the API; the dev server proxies every API path to it. */
const target = process.env.PLAYGROUND_JQ_DEV_API || 'http://127.0.0.1:8765'
const proxiedPaths = ['/api', '/health', '/config.json', '/docs', '/redoc', '/openapi.json']
const proxy = Object.fromEntries(proxiedPaths.map((prefix) => [prefix, { target, changeOrigin: true }]))

export default defineConfig({
    // The static build is served from a sub-path on GitHub Pages.
    base: process.env.PJQ_BASE || '/',
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
    server: { proxy },
    // maplibre's worker is an ES module that imports its shared chunk.
    worker: { format: 'es' },
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        // Monaco and maplibre are each one large chunk, loaded lazily.
        chunkSizeWarningLimit: 3000,
    },
})
