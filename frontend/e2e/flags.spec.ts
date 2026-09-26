import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

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
    /** A variable added with the toolbar's --arg row. */
    variable?: { name: string; value: string; kind: 'arg' | 'argjson' | 'slurpfile' | 'rawfile' }
    /** Positional arguments typed into the --args editor. */
    positional?: { values: string[]; json: boolean }
    /** A module defined with the -L button, named m1. */
    module?: string
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
        variable: { name: 'who', value: 'jq learner', kind: 'arg' },
        program: '"hello \\($who)"',
        input: '',
    },
    {
        click: ['-n', '-c'],
        variable: { name: 'cfg', value: '{"n": [1, 2]}', kind: 'argjson' },
        program: '$cfg.n | add, $cfg',
        input: '',
    },
    {
        click: ['-n', '-c'],
        variable: { name: 's', value: '1 2.50\n{"a": [3]}', kind: 'slurpfile' },
        program: '$s',
        input: '',
    },
    {
        click: ['-n'],
        variable: { name: 'r', value: 'line one\nline two\n', kind: 'rawfile' },
        program: '$r | split("\\n")',
        input: '',
    },
    { click: ['-n', '-c'], positional: { values: ['a', 'b c'], json: false }, program: '$ARGS', input: '' },
    {
        click: ['-n', '-c'],
        positional: { values: ['1', '{"x": [2.50]}'], json: true },
        program: '$ARGS.positional',
        input: '',
    },
    { click: ['-e'], program: '.t', input: JSON_INPUT },
    { click: ['-e'], program: 'false', input: JSON_INPUT },
    { click: ['-e'], program: 'empty', input: JSON_INPUT },
    { click: ['--raw-output0'], program: '.s', input: JSON_INPUT },
    { click: ['-C'], program: '.', input: JSON_INPUT },
    { click: ['-C', '-c', '-S'], program: '.', input: JSON_INPUT },
    { click: ['-C', '-r'], program: '.s, .a', input: JSON_INPUT },
    {
        click: [],
        module: 'def double: . * 2;',
        program: 'import "m1" as m; .b | m::double',
        input: JSON_INPUT,
    },
]

/** The flags on jq's command line for a case, in the order the playground writes them. */
function flagsOf(entry: Case): string[] {
    const order = [
        '-n',
        '-s',
        '-R',
        '-j',
        '--raw-output0',
        '-r',
        '-a',
        '-C',
        '-c',
        '-S',
        '--tab',
        '--seq',
        '--stream',
        '-e',
    ]
    // With -j set, the playground writes -j alone (it implies -r).
    const flags = order.filter(
        (flag) => entry.click.includes(flag) && !(flag === '-r' && entry.click.includes('-j')),
    )
    if (entry.indent !== undefined) flags.push('--indent', String(entry.indent))
    if (entry.variable !== undefined) {
        const { name, value, kind } = entry.variable
        if (kind === 'slurpfile') flags.push('--slurpfile', name, `${name}.json`)
        else if (kind === 'rawfile') flags.push('--rawfile', name, `${name}.txt`)
        else flags.push(`--${kind}`, name, value)
    }
    if (entry.module !== undefined) flags.push('-L', 'modules')
    return flags
}

/** What jq itself prints for the case, and its exit status, run where the files it names exist. */
function jqPrints(entry: Case): { text: string; status: number } {
    const scratch = mkdtempSync(path.join(tmpdir(), 'pjq-e2e-'))
    try {
        if (entry.variable?.kind === 'slurpfile')
            writeFileSync(path.join(scratch, `${entry.variable.name}.json`), entry.variable.value)
        if (entry.variable?.kind === 'rawfile')
            writeFileSync(path.join(scratch, `${entry.variable.name}.txt`), entry.variable.value)
        if (entry.module !== undefined) {
            mkdirSync(path.join(scratch, 'modules'))
            writeFileSync(path.join(scratch, 'modules', 'm1.jq'), entry.module)
        }
        const positional =
            entry.positional === undefined ? [] : [entry.positional.json ? '--jsonargs' : '--args']
        const done = spawnSync(
            JQ,
            [...flagsOf(entry), ...positional, entry.program, ...(entry.positional?.values ?? [])],
            {
                input: entry.input,
                encoding: 'utf8',
                cwd: scratch,
                env: { HOME: '/home/learner' },
            },
        )
        return { text: done.stdout, status: done.status ?? -1 }
    } finally {
        rmSync(scratch, { recursive: true, force: true })
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
            await toolbar.getByRole('button', { name: '--arg', exact: true }).click()
            await page.getByLabel('Variable kind').selectOption(entry.variable.kind)
            await page.getByLabel('Variable name').fill(entry.variable.name)
            await page.getByLabel('Variable value').fill(entry.variable.value)
        }
        if (entry.positional !== undefined) {
            await toolbar.getByRole('button', { name: '--args', exact: true }).click()
            if (entry.positional.json) await page.getByLabel('Positional kind').selectOption('jsonargs')
            await page
                .getByLabel('Positional arguments, one per line')
                .fill(entry.positional.values.join('\n'))
        }
        if (entry.module !== undefined && test.info().project.name === 'static') {
            // The static build has no files, so modules are offered only with the reason why not.
            const button = toolbar.getByRole('button', { name: '-L module' })
            await expect(button).toBeDisabled()
            await expect(button).toHaveAttribute('title', /run the playground locally/)
            return
        }
        if (entry.module !== undefined) {
            await toolbar.getByRole('button', { name: '-L module' }).click()
            await page.getByLabel('Module source').fill(entry.module)
        }
        await page.getByRole('button', { name: 'Run', exact: true }).click()
        const hook = page.getByTestId('run-outputs')
        const shown = async () =>
            JSON.parse((await hook.textContent()) ?? '{}') as {
                text?: string
                exit_code?: number | null
                errors?: { kind: string }[]
            }
        const expected = jqPrints(entry)
        if (entry.program !== 'empty')
            expect(expected.text, 'jq itself printed something to compare with').not.toBe('')
        await expect.poll(async () => (await shown()).text ?? null, { timeout: 20_000 }).toBe(expected.text)
        if (entry.click.includes('-e')) expect((await shown()).exit_code).toBe(expected.status)
    })
}
