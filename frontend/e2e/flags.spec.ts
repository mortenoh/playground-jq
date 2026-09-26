import { execFileSync } from 'node:child_process'

import { expect, test } from '@playwright/test'

/**
 * Every flag in the playground toolbar, clicked the way a person clicks it, alone and in the
 * combinations that interact. The output text on the page must equal what the jq binary itself
 * prints for the same flags, byte for byte. Runs in both projects (server engines and WebAssembly).
 */

const JQ = execFileSync('sh', ['-c', 'command -v jq'], { encoding: 'utf8' }).trim()

const JSON_INPUT =
    '{"b": 1, "a": {"z": [1, "ø", 2.5, 10], "y": null}, "s": "tab\\there", "t": true}\n{"b": 2, "s": "two"}\n'
const TEXT_INPUT = 'alpha,1\nbeta,2\ngamma,3\n'

interface Case {
    /** Toolbar buttons to click, by their label. */
    click: string[]
    /** A variable added with the toolbar's --arg row: name, value, and whether it is --argjson. */
    variable?: { name: string; value: string; json: boolean }
    /** A value for the --indent box, when the case sets one. */
    indent?: number
    program: string
    input: string
}

const CASES: Case[] = [
    { click: [], program: '.', input: JSON_INPUT },
    { click: ['-c'], program: '., .n + 1', input: '{"n": 24.0, "e": 1e3, "z": 1.000, "m": -0}' },
    { click: ['-c'], program: '.', input: JSON_INPUT },
    { click: ['-r'], program: '.s', input: JSON_INPUT },
    { click: ['-j'], program: '.s', input: JSON_INPUT },
    { click: ['-a'], program: '.a.z', input: JSON_INPUT },
    { click: ['-S'], program: '.', input: JSON_INPUT },
    { click: ['--tab'], program: '.a', input: JSON_INPUT },
    { click: ['-s'], program: 'map(.b)', input: JSON_INPUT },
    { click: ['-n'], program: '[inputs | .b]', input: JSON_INPUT },
    { click: ['-R'], program: 'split(",")', input: TEXT_INPUT },
    { click: ['-R', '-s'], program: 'length', input: TEXT_INPUT },
    { click: ['-R', '-n'], program: '[inputs]', input: TEXT_INPUT },
    { click: ['-n', '--seq'], program: '1, [2, 3]', input: '' },
    { click: ['--stream', '-c'], program: '.', input: JSON_INPUT },
    { click: ['-r', '-j'], program: '.s', input: JSON_INPUT },
    { click: ['-c', '-S'], program: '.', input: JSON_INPUT },
    { click: ['-c', '--tab'], program: '.a', input: JSON_INPUT },
    { click: ['-r', '-a'], program: '.a.z[]', input: JSON_INPUT },
    { click: ['-S', '--tab'], program: '.', input: JSON_INPUT },
    { click: [], indent: 0, program: '.a', input: JSON_INPUT },
    { click: [], indent: 4, program: '.a', input: JSON_INPUT },
    { click: ['-S'], indent: 7, program: '.', input: JSON_INPUT },
    {
        click: ['-n'],
        variable: { name: 'who', value: 'jq learner', json: false },
        program: '"hello \\($who)"',
        input: '',
    },
    {
        click: ['-n', '-c'],
        variable: { name: 'cfg', value: '{"n": [1, 2]}', json: true },
        program: '$cfg.n | add, $cfg',
        input: '',
    },
]

/** The flags on jq's command line for a case, in the order the playground writes them. */
function flagsOf(entry: Case): string[] {
    const order = ['-n', '-s', '-R', '-j', '-r', '-a', '-c', '-S', '--tab', '--seq', '--stream']
    // With -j set, the playground writes -j alone (it implies -r).
    const flags = order.filter(
        (flag) => entry.click.includes(flag) && !(flag === '-r' && entry.click.includes('-j')),
    )
    if (entry.indent !== undefined) flags.push('--indent', String(entry.indent))
    if (entry.variable !== undefined) {
        const { name, value, json } = entry.variable
        flags.push(json ? '--argjson' : '--arg', name, value)
    }
    return flags
}

function jqPrints(entry: Case): string {
    try {
        return execFileSync(JQ, [...flagsOf(entry), entry.program], {
            input: entry.input,
            encoding: 'utf8',
            env: { HOME: '/home/learner' },
        })
    } catch (error) {
        return (error as { stdout: string }).stdout
    }
}

for (const entry of CASES) {
    const label = [
        ...entry.click,
        ...(entry.indent === undefined ? [] : [`--indent ${String(entry.indent)}`]),
    ]
    test(`flags ${label.join(' ') || '(none)'} | ${entry.program}`, async ({ page }) => {
        await page.addInitScript(
            ({ program, input }) => {
                if (sessionStorage.getItem('seeded') !== null) return
                sessionStorage.setItem('seeded', '1')
                localStorage.setItem(
                    'pjq.playground',
                    JSON.stringify({
                        program,
                        input,
                        options: {
                            slurp: false,
                            null_input: false,
                            raw_input: false,
                            raw_output: false,
                            join_output: false,
                            ascii_output: false,
                            compact: false,
                            sort_keys: false,
                            tab: false,
                            indent: 2,
                            seq: false,
                            stream: false,
                            args: {},
                            argjson: {},
                            engine: 'auto',
                        },
                        origin: null,
                        lesson: null,
                    }),
                )
            },
            { program: entry.program, input: entry.input },
        )
        await page.goto('./')
        const toolbar = page.getByLabel('jq flags')
        for (const flag of entry.click) {
            await toolbar.getByRole('button', { name: flag, exact: true }).click()
        }
        if (entry.indent !== undefined) await page.getByLabel('Indent').fill(String(entry.indent))
        if (entry.variable !== undefined) {
            await toolbar.getByRole('button', { name: '--arg' }).click()
            if (entry.variable.json) await page.getByLabel('Variable kind').selectOption('argjson')
            await page.getByLabel('Variable name').fill(entry.variable.name)
            await page.getByLabel('Variable value').fill(entry.variable.value)
        }
        await page.getByRole('button', { name: 'Run', exact: true }).click()
        const expected = jqPrints(entry)
        expect(expected, 'jq itself printed something to compare with').not.toBe('')
        const hook = page.getByTestId('run-outputs')
        await expect
            .poll(
                async () =>
                    (JSON.parse((await hook.textContent()) ?? '{}') as { text?: string }).text ?? null,
                {
                    timeout: 20_000,
                },
            )
            .toBe(expected)
    })
}
