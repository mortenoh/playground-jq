import { execSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import { BACKEND_URL } from '../playwright.config.ts'

/**
 * Every runnable piece of content, driven through the UI the way a learner would:
 *
 * - an example is opened from its page into the playground and run;
 * - a tutorial step is solved with its reference solution and checked;
 * - a guide snippet is opened with "Try it" and run.
 *
 * The outputs the UI shows are compared with the backend's own run of the same program over the
 * same input, and with the recorded expected outputs. Runs in both projects: the backend build
 * and the static (WebAssembly) build.
 */

interface Item {
    kind: 'example' | 'tutorial' | 'snippet'
    id: string
    program: string
    input: { ref: string | null; text: string | null } | null
    options: Record<string, unknown>
    check: { expected: unknown[] | null; error: string | null; unordered: boolean }
    chapter: string | null
}

interface Shown {
    outputs: unknown[]
    errors: { kind: string; message: string }[]
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const items = JSON.parse(
    execSync('uv run python scripts/e2e_items.py', {
        cwd: root,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
    }),
) as Item[]

const only = process.env.E2E_ONLY
const selected = only === undefined ? items : items.filter((item) => item.id.startsWith(only))

function canonical(value: unknown): string {
    return JSON.stringify(value, (_key, held: unknown) =>
        held !== null && typeof held === 'object' && !Array.isArray(held)
            ? Object.fromEntries(Object.entries(held).toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
            : held,
    )
}

function same(expected: unknown[], actual: unknown[], unordered: boolean): boolean {
    if (!unordered) return canonical(expected) === canonical(actual)
    const sort = (values: unknown[]) => values.map(canonical).toSorted()
    return canonical(sort(expected)) === canonical(sort(actual))
}

async function reference(request: APIRequestContext, item: Item): Promise<Shown> {
    let input = ''
    if (item.input !== null) {
        const resolved = await request.post(`${BACKEND_URL}/api/inputs/resolve`, { data: item.input })
        input = ((await resolved.json()) as { text: string }).text
    }
    const answered = await request.post(`${BACKEND_URL}/api/run`, {
        data: { program: item.program, input, options: item.options },
    })
    return (await answered.json()) as Shown
}

async function shownIn(page: Page, program: string): Promise<Shown> {
    await page.getByRole('button', { name: 'Run', exact: true }).click()
    const hook = page.getByTestId('run-outputs')
    await expect.poll(async () => hook.getAttribute('data-program'), { timeout: 30_000 }).toBe(program)
    return JSON.parse((await hook.textContent()) ?? '{}') as Shown
}

function expectMatches(item: Item, shown: Shown, backend: Shown): void {
    if (item.check.error !== null) {
        const said = shown.errors.map((error) => error.message).join(' ')
        expect(said, 'the error the UI shows').toContain(item.check.error)
        return
    }
    expect(shown.errors, 'errors the UI shows').toEqual([])
    expect(
        same(backend.outputs, shown.outputs, item.check.unordered),
        'UI outputs equal the backend run',
    ).toBe(true)
    if (item.check.expected !== null) {
        expect(
            same(item.check.expected, shown.outputs, item.check.unordered),
            'UI outputs equal the recorded ones',
        ).toBe(true)
    }
}

for (const item of selected) {
    test(`${item.kind} ${item.id}`, async ({ page, request }) => {
        if (item.kind === 'tutorial') {
            const [tutorial, step] = item.id.split('/')
            await page.goto(`learn/${tutorial ?? ''}/${step ?? '1'}`)
            await page.getByRole('button', { name: 'Show the solution' }).click()
            await page.getByRole('button', { name: 'Use it' }).click()
            await page.getByRole('button', { name: 'Check', exact: true }).click()
            await expect(page.getByTestId('check-verdict')).toHaveText('Correct', { timeout: 30_000 })
            return
        }
        const backend = await reference(request, item)
        if (item.kind === 'example') {
            await page.goto(`examples/${encodeURIComponent(item.id)}`)
            await page.getByRole('button', { name: 'Open in the playground' }).click()
        } else {
            await page.goto(`guide/${item.chapter ?? ''}`)
            await page.getByTestId(`snippet-${item.id}`).getByRole('button', { name: 'Try it' }).click()
        }
        await expect(page.getByRole('region', { name: 'Program' })).toBeVisible()
        expectMatches(item, await shownIn(page, item.program), backend)
    })
}
