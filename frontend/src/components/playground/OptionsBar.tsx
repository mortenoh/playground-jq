import { Plus, X } from 'lucide-react'

import { NativeSelect } from '@/components/NativeSelect'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
    | 'compact'
    | 'sort_keys'
    | 'tab'
    | 'ascii_output'
    | 'seq'
    | 'stream'

const FLAGS: { key: Flag; flag: string; help: string }[] = [
    { key: 'null_input', flag: '-n', help: 'Run once with null as input; read inputs with input/inputs.' },
    { key: 'slurp', flag: '-s', help: 'Read every input value into one array.' },
    { key: 'raw_input', flag: '-R', help: 'Each line of input is a string, not JSON.' },
    { key: 'raw_output', flag: '-r', help: 'Write strings without quotes.' },
    { key: 'join_output', flag: '-j', help: 'Like -r, with no newline between outputs.' },
    { key: 'compact', flag: '-c', help: 'One line per output.' },
    { key: 'sort_keys', flag: '-S', help: 'Sort object keys.' },
    { key: 'tab', flag: '--tab', help: 'Indent with tabs.' },
    { key: 'ascii_output', flag: '-a', help: 'Escape non-ASCII characters.' },
    { key: 'seq', flag: '--seq', help: 'Prefix outputs with the record separator (RFC 7464).' },
    { key: 'stream', flag: '--stream', help: 'Read input as [path, leaf] events (uses the jq binary).' },
]

interface Variable {
    name: string
    value: string
    json: boolean
}

function variablesOf(options: RunOptions): Variable[] {
    return [
        ...Object.entries(options.args).map(([name, value]) => ({ name, value, json: false })),
        ...Object.entries(options.argjson).map(([name, value]) => ({
            name,
            value: JSON.stringify(value),
            json: true,
        })),
    ]
}

function withVariables(options: RunOptions, variables: Variable[]): RunOptions {
    const args: Record<string, string> = {}
    const argjson: Record<string, JsonValue> = {}
    for (const variable of variables) {
        if (variable.name === '') continue
        if (!variable.json) {
            args[variable.name] = variable.value
            continue
        }
        try {
            argjson[variable.name] = JSON.parse(variable.value) as JsonValue
        } catch {
            argjson[variable.name] = variable.value
        }
    }
    return { ...options, args, argjson }
}

/** The command-line flags, `--arg`/`--argjson` variables, and the engine choice. */
export function OptionsBar({
    options,
    onChange,
}: {
    options: RunOptions
    onChange: (options: RunOptions) => void
}) {
    const variables = variablesOf(options)
    return (
        <div className="flex flex-wrap items-center gap-1" aria-label="jq flags">
            {FLAGS.map(({ key, flag, help }) => (
                <Tooltip key={key}>
                    <TooltipTrigger
                        render={
                            <button
                                type="button"
                                aria-pressed={options[key]}
                                onClick={() => onChange({ ...options, [key]: !options[key] })}
                                className={cn(
                                    'h-7 rounded-md border px-2 font-mono text-xs transition-colors',
                                    options[key]
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
                    title="auto uses jq.py and switches to the jq binary for input/inputs, debug, --stream"
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
                            { name: `v${String(variables.length + 1)}`, value: '', json: false },
                        ]),
                    )
                }
            >
                <Plus /> --arg
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
                        return (
                            <div
                                key={index}
                                className="flex items-center gap-1 rounded-md border px-1 py-0.5"
                            >
                                <NativeSelect
                                    aria-label="Variable kind"
                                    value={variable.json ? 'argjson' : 'arg'}
                                    onChange={(event) => update({ json: event.target.value === 'argjson' })}
                                    className="h-6 border-0 bg-transparent px-1 font-mono text-xs"
                                >
                                    <option value="arg">--arg</option>
                                    <option value="argjson">--argjson</option>
                                </NativeSelect>
                                <span className="font-mono text-xs text-muted-foreground">$</span>
                                <Input
                                    aria-label="Variable name"
                                    value={variable.name}
                                    onChange={(event) =>
                                        update({ name: event.target.value.replace(/[^A-Za-z0-9_]/g, '') })
                                    }
                                    className="h-6 w-20 px-1 font-mono text-xs"
                                />
                                <Input
                                    aria-label="Variable value"
                                    value={variable.value}
                                    onChange={(event) => update({ value: event.target.value })}
                                    className="h-6 w-36 px-1 font-mono text-xs"
                                />
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
        </div>
    )
}
