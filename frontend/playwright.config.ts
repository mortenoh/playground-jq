import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig, devices } from '@playwright/test'

/**
 * The browser suite runs against a real `pjq serve` serving the built bundle, on its own port.
 * Prerequisites: `make install` (builds the bundle) and `bunx playwright install chromium`.
 */

const here = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(here, '..')

export const E2E_PORT = Number(process.env.E2E_PORT ?? 8799)
export const E2E_BASE_URL = `http://127.0.0.1:${String(E2E_PORT)}`

export default defineConfig({
    testDir: './e2e',
    fullyParallel: false,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 1 : 0,
    workers: 1,
    reporter: process.env.CI ? 'github' : 'list',
    use: { baseURL: E2E_BASE_URL, trace: 'retain-on-failure' },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
    webServer: {
        command: `uv run pjq serve --host 127.0.0.1 --port ${String(E2E_PORT)}`,
        cwd: repositoryRoot,
        env: { PLAYGROUND_JQ_DHIS2_ENABLED: 'false', PLAYGROUND_JQ_LOG_LEVEL: 'WARNING' },
        url: `${E2E_BASE_URL}/health`,
        reuseExistingServer: !process.env.CI,
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 120_000,
    },
})
