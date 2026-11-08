import path from 'node:path'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { appearanceScript } from '@winterop-com/sokkel-ui/lib/appearance'
import { defineConfig, type Plugin } from 'vite'

import { APPEARANCE_DEFAULTS } from './src/appearance.ts'
import pkg from './package.json' with { type: 'json' }

/** Where `make dev` serves the API; the dev server proxies every API path to it. */
const target = process.env.PLAYGROUND_JQ_DEV_API || 'http://127.0.0.1:8765'
const proxiedPaths = ['/api', '/health', '/config.json', '/docs', '/redoc', '/openapi.json']
const proxy = Object.fromEntries(proxiedPaths.map((prefix) => [prefix, { target, changeOrigin: true }]))

/** Writes the kept look on `<html>` before the page draws, so it never flashes the wrong scheme. */
const appearance: Plugin = {
    name: 'appearance-script',
    transformIndexHtml: () => [
        { tag: 'script', children: appearanceScript(APPEARANCE_DEFAULTS), injectTo: 'head-prepend' },
    ],
}

export default defineConfig({
    // The static build is served from a sub-path on GitHub Pages.
    base: process.env.PJQ_BASE || '/',
    plugins: [appearance, react(), tailwindcss()],
    define: { __APP_VERSION__: JSON.stringify(pkg.version) },
    resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
    server: { proxy },
    // maplibre's worker is an ES module that imports its shared chunk.
    worker: { format: 'es' },
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        // CodeMirror, shiki and maplibre are each loaded lazily, in chunks of their own.
        chunkSizeWarningLimit: 3000,
    },
})
