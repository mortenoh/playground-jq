import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig, devices } from '@playwright/test'

/**
 * The browser suite drives every example, tutorial solution and guide snippet through the UI,
 * twice: against the backend build (`pjq serve`), and against the static build (jq in
 * WebAssembly, as published on GitHub Pages). Both are compared with the backend's own run.
 *
 * Prerequisites: `make install` (builds the bundle into the package), `scripts/build_pages.sh
 * build/pages` (the static site), and `bunx playwright install chromium`. `make e2e` does all of it.
 */

const here = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(here, '..')

export const BACKEND_PORT = Number(process.env.E2E_PORT ?? 8799)
export const BACKEND_URL = `http://127.0.0.1:${String(BACKEND_PORT)}`
export const STATIC_PORT = BACKEND_PORT - 1
export const STATIC_URL = `http://127.0.0.1:${String(STATIC_PORT)}/playground-jq/`

export default defineConfig({
    testDir: './e2e',
    fullyParallel: true,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 1 : 0,
    workers: process.env.E2E_WORKERS ? Number(process.env.E2E_WORKERS) : 4,
    reporter: process.env.CI ? 'github' : [['list'], ['json', { outputFile: 'test-results/results.json' }]],
    timeout: 60_000,
    use: { trace: 'retain-on-failure' },
    projects: [
        { name: 'backend', use: { ...devices['Desktop Chrome'], baseURL: `${BACKEND_URL}/` } },
        { name: 'static', use: { ...devices['Desktop Chrome'], baseURL: STATIC_URL } },
    ],
    webServer: [
        {
            command: `uv run pjq serve --host 127.0.0.1 --port ${String(BACKEND_PORT)}`,
            cwd: repositoryRoot,
            env: { PLAYGROUND_JQ_DHIS2_ENABLED: 'false', PLAYGROUND_JQ_LOG_LEVEL: 'WARNING' },
            url: `${BACKEND_URL}/health`,
            reuseExistingServer: !process.env.CI,
            stdout: 'pipe',
            stderr: 'pipe',
            timeout: 120_000,
        },
        {
            command: `uv run python scripts/serve_pages.py build/pages ${String(STATIC_PORT)}`,
            cwd: repositoryRoot,
            url: STATIC_URL,
            reuseExistingServer: !process.env.CI,
            timeout: 30_000,
        },
    ],
})
