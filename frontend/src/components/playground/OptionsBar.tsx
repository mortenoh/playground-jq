import { Plus, X } from 'lucide-react'
import { useState } from 'react'

import { NativeSelect } from '@/components/NativeSelect'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { STATIC } from '@/lib/runtime'
import type { JsonValue, RunOptions } from '@/lib/types'
import { cn } from '@/lib/utils'

type Flag =
    | 'null_input'
    | 'slurp'
    | 'raw_input'
    | 'raw_output'
    | 'join_output'
    | 'raw_output0'
    | 'compact'
    | 'sort_keys'
    | 'tab'
    | 'ascii_output'
    | 'color'
    | 'seq'
    | 'stream'
    | 'exit_status'

const FLAGS: { key: Flag; flag: string; help: string }[] = [
    { key: 'null_input', flag: '-n', help: 'Run once with null as input; read inputs with input/inputs.' },
    { key: 'slurp', flag: '-s', help: 'Read every input value into one array.' },
    { key: 'raw_input', flag: '-R', help: 'Each line of input is a string, not JSON.' },
    { key: 'raw_output', flag: '-r', help: 'Write strings without quotes.' },
    { key: 'join_output', flag: '-j', help: 'Like -r, with no newline between outputs.' },
    { key: 'raw_output0', flag: '--raw-output0', help: 'Like -r, with a NUL after every output.' },
    { key: 'compact', flag: '-c', help: 'One line per output.' },
    { key: 'sort_keys', flag: '-S', help: 'Sort object keys.' },
    { key: 'tab', flag: '--tab', help: 'Indent with tabs.' },
    { key: 'ascii_output', flag: '-a', help: 'Escape non-ASCII characters.' },
    { key: 'color', flag: '-C', help: 'Colour the output (ANSI escape codes).' },
    { key: 'seq', flag: '--seq', help: 'Prefix outputs with the record separator (RFC 7464).' },
    { key: 'stream', flag: '--stream', help: 'Read input as [path, leaf] events.' },
    {
        key: 'exit_status',
        flag: '-e',
        help: 'Set the exit status from the last output: 1 for false or null, 4 for none.',
    },
]

type VariableKind = 'arg' | 'argjson' | 'slurpfile' | 'rawfile'

interface Variable {
    kind: VariableKind
    name: string
    value: string
}

const KIND_HELP: Record<VariableKind, string> = {
    arg: 'Value (a string)',
    argjson: 'Value (JSON)',
    slurpfile: 'File content (JSON values; $name is an array of them)',
    rawfile: 'File content (text; $name is this string)',
}

function variablesOf(options: RunOptions): Variable[] {
    return [
        ...Object.entries(options.args).map(([name, value]) => ({ kind: 'arg' as const, name, value })),
        ...Object.entries(options.argjson).map(([name, value]) => ({
            kind: 'argjson' as const,
            name,
            value: JSON.stringify(value),
        })),
        ...Object.entries(options.slurpfile).map(([name, value]) => ({
            kind: 'slurpfile' as const,
            name,
            value,
        })),
        ...Object.entries(options.rawfile).map(([name, value]) => ({
            kind: 'rawfile' as const,
            name,
            value,
        })),
    ]
}

function withVariables(options: RunOptions, variables: Variable[]): RunOptions {
    const args: Record<string, string> = {}
    const argjson: Record<string, JsonValue> = {}
    const slurpfile: Record<string, string> = {}
    const rawfile: Record<string, string> = {}
    for (const { kind, name, value } of variables) {
        if (name === '') continue
        if (kind === 'arg') args[name] = value
        else if (kind === 'slurpfile') slurpfile[name] = value
        else if (kind === 'rawfile') rawfile[name] = value
        else {
            try {
                argjson[name] = JSON.parse(value) as JsonValue
            } catch {
                argjson[name] = value
            }
        }
    }
    return { ...options, args, argjson, slurpfile, rawfile }
}

/** Positional arguments are edited one per line; a final empty line is not an argument. */
function linesOf(text: string): string[] {
    const lines = text.split('\n')
    if (lines.at(-1) === '') lines.pop()
    return lines
}

function FlagButton({
    flag,
    help,
    pressed,
    onToggle,
}: {
    flag: string
    help: string
    pressed: boolean
    onToggle: () => void
}) {
    return (
        <Tooltip>
            <TooltipTrigger
                render={
                    <button
                        type="button"
                        aria-pressed={pressed}
                        onClick={onToggle}
                        className={cn(
                            'h-7 rounded-md border px-2 font-mono text-xs transition-colors',
                            pressed
                                ? 'border-primary bg-accent text-accent-foreground'
                                : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
                        )}
                    >
                        {flag}
                    </button>
                }
            />
            <TooltipContent>{help}</TooltipContent>
        </Tooltip>
    )
}

/** Every jq command-line option the playground supports: flags, variables, files, positional arguments and modules. */
export function OptionsBar({
    options,
    onChange,
}: {
    options: RunOptions
    onChange: (options: RunOptions) => void
}) {
    const variables = variablesOf(options)
    const [showPositional, setShowPositional] = useState(options.positional.length > 0)
    const [positionalText, setPositionalText] = useState(options.positional.join('\n'))
    const moduleNames = Object.keys(options.modules)

    return (
        <div className="flex flex-wrap items-center gap-1" aria-label="jq flags">
            {FLAGS.map(({ key, flag, help }) => (
                <FlagButton
                    key={key}
                    flag={flag}
                    help={help}
                    pressed={options[key]}
                    onToggle={() => onChange({ ...options, [key]: !options[key] })}
                />
            ))}
            <label className="ml-1 flex items-center gap-1 font-mono text-xs text-muted-foreground">
                --indent
                <Input
                    type="number"
                    min={0}
                    max={7}
                    value={options.indent}
                    onChange={(event) =>
                        onChange({ ...options, indent: Math.max(0, Math.min(7, Number(event.target.value))) })
                    }
                    className="h-7 w-12 px-1 text-xs"
                    aria-label="Indent"
                />
            </label>
            {!STATIC && (
                <NativeSelect
                    aria-label="Engine"
                    value={options.engine}
                    onChange={(event) =>
                        onChange({ ...options, engine: event.target.value as RunOptions['engine'] })
                    }
                    className="ml-1 h-7 text-xs"
                    title="auto uses jq.py and switches to the jq binary for anything only the command line does"
                >
                    <option value="auto">engine: auto</option>
                    <option value="library">engine: jq.py</option>
                    <option value="cli">engine: jq binary</option>
                </NativeSelect>
            )}
            <Button
                variant="ghost"
                size="xs"
                onClick={() =>
                    onChange(
                        withVariables(options, [
                            ...variables,
                            { kind: 'arg', name: `v${String(variables.length + 1)}`, value: '' },
                        ]),
                    )
                }
            >
                <Plus /> --arg
            </Button>
            <Button
                variant="ghost"
                size="xs"
                onClick={() => setShowPositional(true)}
                disabled={showPositional}
            >
                <Plus /> --args
            </Button>
            <Button
                variant="ghost"
                size="xs"
                disabled={STATIC}
                title={
                    STATIC
                        ? 'Modules need files on disk: run the playground locally to use -L'
                        : 'Define a module for import/include (-L)'
                }
                onClick={() =>
                    onChange({
                        ...options,
                        modules: {
                            ...options.modules,
                            [`m${String(moduleNames.length + 1)}`]: 'def hello: "hello";',
                        },
                    })
                }
            >
                <Plus /> -L module
            </Button>
            {variables.length > 0 && (
                <div className="flex w-full flex-wrap gap-2 pt-1">
                    {variables.map((variable, index) => {
                        const update = (change: Partial<Variable>) =>
                            onChange(
                                withVariables(
                                    options,
                                    variables.map((held, at) =>
                                        at === index ? { ...held, ...change } : held,
                                    ),
                                ),
                            )
                        const file = variable.kind === 'slurpfile' || variable.kind === 'rawfile'
                        return (
                            <div key={index} className="flex items-start gap-1 rounded-md border px-1 py-0.5">
                                <NativeSelect
                                    aria-label="Variable kind"
                                    value={variable.kind}
                                    onChange={(event) => update({ kind: event.target.value as VariableKind })}
                                    className="h-6 border-0 bg-transparent px-1 font-mono text-xs"
                                >
                                    <option value="arg">--arg</option>
                                    <option value="argjson">--argjson</option>
                                    <option value="slurpfile">--slurpfile</option>
                                    <option value="rawfile">--rawfile</option>
                                </NativeSelect>
                                <span className="pt-0.5 font-mono text-xs text-muted-foreground">$</span>
                                <Input
                                    aria-label="Variable name"
                                    value={variable.name}
                                    onChange={(event) =>
                                        update({ name: event.target.value.replace(/[^A-Za-z0-9_]/g, '') })
                                    }
                                    className="h-6 w-20 px-1 font-mono text-xs"
                                />
                                {file ? (
                                    <Textarea
                                        aria-label="Variable value"
                                        placeholder={KIND_HELP[variable.kind]}
                                        value={variable.value}
                                        onChange={(event) => update({ value: event.target.value })}
                                        className="min-h-14 w-56 px-1 py-0.5 font-mono text-xs"
                                    />
                                ) : (
                                    <Input
                                        aria-label="Variable value"
                                        placeholder={KIND_HELP[variable.kind]}
                                        value={variable.value}
                                        onChange={(event) => update({ value: event.target.value })}
                                        className="h-6 w-36 px-1 font-mono text-xs"
                                    />
                                )}
                                <Button
                                    variant="ghost"
                                    size="icon-xs"
                                    aria-label="Remove the variable"
                                    onClick={() =>
                                        onChange(
                                            withVariables(
                                                options,
                                                variables.filter((_, at) => at !== index),
                                            ),
                                        )
                                    }
                                >
                                    <X />
                                </Button>
                            </div>
                        )
                    })}
                </div>
            )}
            {showPositional && (
                <div className="flex w-full items-start gap-2 pt-1" aria-label="Positional arguments">
                    <NativeSelect
                        aria-label="Positional kind"
                        value={options.positional_json ? 'jsonargs' : 'args'}
                        onChange={(event) =>
                            onChange({ ...options, positional_json: event.target.value === 'jsonargs' })
                        }
                        className="h-6 px-1 font-mono text-xs"
                    >
                        <option value="args">--args</option>
                        <option value="jsonargs">--jsonargs</option>
                    </NativeSelect>
                    <Textarea
                        aria-label="Positional arguments, one per line"
                        placeholder="One argument per line; $ARGS.positional holds them"
                        value={positionalText}
                        onChange={(event) => {
                            setPositionalText(event.target.value)
                            onChange({ ...options, positional: linesOf(event.target.value) })
                        }}
                        className="min-h-14 w-72 px-1 py-0.5 font-mono text-xs"
                    />
                    <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Remove the positional arguments"
                        onClick={() => {
                            setShowPositional(false)
                            setPositionalText('')
                            onChange({ ...options, positional: [], positional_json: false })
                        }}
                    >
                        <X />
                    </Button>
                </div>
            )}
            {moduleNames.length > 0 && (
                <div className="flex w-full flex-wrap gap-2 pt-1" aria-label="Modules">
                    {moduleNames.map((name) => (
                        <div key={name} className="flex items-start gap-1 rounded-md border px-1 py-0.5">
                            <span className="pt-0.5 font-mono text-xs text-muted-foreground">modules/</span>
                            <Input
                                aria-label="Module name"
                                defaultValue={name}
                                onBlur={(event) => {
                                    const renamed = event.target.value.replace(/[^A-Za-z0-9_]/g, '')
                                    if (renamed === '' || renamed === name) return
                                    const { [name]: source = '', ...rest } = options.modules
                                    onChange({ ...options, modules: { ...rest, [renamed]: source } })
                                }}
                                className="h-6 w-20 px-1 font-mono text-xs"
                            />
                            <span className="pt-0.5 font-mono text-xs text-muted-foreground">.jq</span>
                            <Textarea
                                aria-label="Module source"
                                value={options.modules[name]}
                                onChange={(event) =>
                                    onChange({
                                        ...options,
                                        modules: { ...options.modules, [name]: event.target.value },
                                    })
                                }
                                className="min-h-14 w-72 px-1 py-0.5 font-mono text-xs"
                            />
                            <Button
                                variant="ghost"
                                size="icon-xs"
                                aria-label="Remove the module"
                                onClick={() => {
                                    const { [name]: _removed, ...rest } = options.modules
                                    onChange({ ...options, modules: rest })
                                }}
                            >
                                <X />
                            </Button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
