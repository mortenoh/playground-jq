import { ExternalLink, History, Link2, Play, RotateCcw, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { CodePane } from '@/components/editor/CodePane'
import { Markdown } from '@/components/Markdown'
import { OptionsBar } from '@/components/playground/OptionsBar'
import { OutputPanel } from '@/components/playground/OutputPanel'
import { SourcePicker } from '@/components/playground/SourcePicker'
import { Button } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useStore } from '@/hooks/use-store'
import { ApiError } from '@/lib/api'
import { listSources, resolveInput, runProgram } from '@/lib/client'
import { playground, STARTER, type PlaygroundState } from '@/lib/playground'
import { history, remember } from '@/lib/progress'
import { decodeState, encodeState } from '@/lib/share'
import type { RunResult, SourceInfo } from '@/lib/types'

/** Inputs above this size are not re-run on every keystroke; Run or Cmd/Ctrl+Enter runs them. */
const AUTO_RUN_LIMIT = 400_000
const AUTO_RUN_DELAY_MS = 350

function update(change: Partial<PlaygroundState>): void {
    playground.update((held) => ({ ...held, ...change }))
}

function LessonCard({ state }: { state: PlaygroundState }) {
    const lesson = state.lesson
    if (lesson === null) return null
    return (
        <aside
            className="max-h-[40%] shrink-0 overflow-auto border-b bg-accent/30 px-4 py-3"
            aria-label="Lesson"
        >
            <div className="flex items-start gap-2">
                <h2 className="flex-1 text-sm font-semibold">{lesson.title}</h2>
                <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Close the lesson"
                    onClick={() => update({ lesson: null })}
                >
                    <X />
                </Button>
            </div>
            {lesson.explanation !== '' && <Markdown text={lesson.explanation} className="text-sm" />}
            <div className="mt-1 flex flex-wrap gap-3 text-xs">
                {lesson.manual.map((link) => (
                    <a
                        key={link}
                        href={link}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-primary-ink underline"
                    >
                        jq manual <ExternalLink className="size-3" aria-hidden />
                    </a>
                ))}
                {lesson.attribution !== null && (
                    <span className="text-muted-foreground">{lesson.attribution}</span>
                )}
            </div>
        </aside>
    )
}

export default function PlaygroundPage() {
    const state = useStore(playground)
    const recent = useStore(history)
    const [sources, setSources] = useState<SourceInfo[]>([])
    const [result, setResult] = useState<RunResult | null>(null)
    const [running, setRunning] = useState(false)
    const sequence = useRef(0)

    useEffect(() => {
        void listSources().then(setSources, () => undefined)
        const shared = decodeState(window.location.hash)
        if (shared === null) return
        playground.set({
            ...STARTER,
            program: shared.program,
            input: shared.input ?? '',
            options: shared.options,
            origin: null,
            lesson: null,
        })
        if (shared.ref !== undefined) {
            const ref = shared.ref
            void resolveInput({ ref, text: null }).then(({ text }) => {
                update({ input: text, origin: { ref, title: ref, live: false } })
            })
        }
        window.history.replaceState(null, '', window.location.pathname)
    }, [])

    const run = useCallback(async (current: PlaygroundState, record: boolean) => {
        const ticket = ++sequence.current
        setRunning(true)
        try {
            const answer = await runProgram({
                program: current.program,
                input: current.input,
                options: current.options,
            })
            if (ticket !== sequence.current) return
            setResult(answer)
            if (record && answer.ok) remember(current.program)
        } catch (error) {
            if (ticket !== sequence.current) return
            toast.error(error instanceof ApiError ? error.problem.detail : String(error))
        } finally {
            if (ticket === sequence.current) setRunning(false)
        }
    }, [])

    useEffect(() => {
        if (state.input.length > AUTO_RUN_LIMIT) return
        const timer = setTimeout(() => {
            void run(state, false)
        }, AUTO_RUN_DELAY_MS)
        return () => {
            clearTimeout(timer)
        }
        // Re-run when what the run reads changes, not on every state change (origin, lesson).
        // oxlint-disable-next-line react/exhaustive-deps
    }, [state.program, state.input, state.options, run])

    const runNow = () => {
        void run(playground.get(), true)
    }

    function share(): void {
        const hash = encodeState({
            program: state.program,
            input: state.origin === null || state.origin.ref.endsWith(':custom') ? state.input : undefined,
            ref:
                state.origin !== null && !state.origin.ref.endsWith(':custom') ? state.origin.ref : undefined,
            options: state.options,
        })
        const url = `${window.location.origin}/${hash}`
        void navigator.clipboard.writeText(url).then(
            () =>
                toast.success('Link copied', {
                    description: 'Anyone with the link opens this program, input and flags.',
                }),
            () => toast.error('Could not copy the link'),
        )
    }

    const raw = state.options.raw_output || state.options.join_output || state.options.seq

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="flex shrink-0 flex-col gap-2 border-b px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                    <SourcePicker
                        sources={sources}
                        origin={state.origin}
                        onLoaded={(text, origin) => update({ input: text, origin })}
                    />
                    <div className="ml-auto flex items-center gap-1">
                        <DropdownMenu>
                            <DropdownMenuTrigger
                                render={<Button variant="ghost" size="sm" disabled={recent.length === 0} />}
                            >
                                <History /> History
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="max-h-96 w-96 overflow-auto">
                                <DropdownMenuLabel>Recent programs</DropdownMenuLabel>
                                {recent.map((entry) => (
                                    <DropdownMenuItem
                                        key={entry.program}
                                        onClick={() => update({ program: entry.program })}
                                    >
                                        <span className="truncate font-mono text-xs">{entry.program}</span>
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                playground.set(STARTER)
                            }}
                        >
                            <RotateCcw /> Reset
                        </Button>
                        <Button variant="outline" size="sm" onClick={share}>
                            <Link2 /> Share
                        </Button>
                        <Button
                            size="sm"
                            onClick={runNow}
                            disabled={running}
                            aria-keyshortcuts="Control+Enter Meta+Enter"
                        >
                            <Play /> Run
                        </Button>
                    </div>
                </div>
                <OptionsBar options={state.options} onChange={(options) => update({ options })} />
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
                <section
                    className="flex min-h-64 flex-col border-b lg:border-r lg:border-b-0"
                    aria-label="Input"
                >
                    <div className="flex h-9 shrink-0 items-center gap-2 border-b px-2">
                        <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                            Input
                        </span>
                        {state.origin !== null && (
                            <span
                                className="truncate text-xs text-muted-foreground"
                                data-testid="input-origin"
                            >
                                {state.origin.title}
                                {state.origin.live ? ' (live)' : ''}
                            </span>
                        )}
                        <span className="ml-auto text-xs text-faint">
                            {(state.input.length / 1024).toFixed(1)} KB
                        </span>
                    </div>
                    <div className="min-h-0 flex-1">
                        <CodePane
                            value={state.input}
                            language={state.options.raw_input ? 'plaintext' : 'json'}
                            path="input"
                            label="Input"
                            onChange={(input) => update({ input, origin: null })}
                            onRun={runNow}
                        />
                    </div>
                </section>
                <div className="flex min-h-0 flex-col">
                    <LessonCard state={state} />
                    <section
                        className="flex h-[38%] min-h-32 shrink-0 flex-col border-b"
                        aria-label="Program"
                    >
                        <div className="flex h-9 shrink-0 items-center gap-2 border-b px-2">
                            <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                                Program
                            </span>
                            <span className="text-xs text-faint">
                                Cmd/Ctrl+Enter runs; edits run automatically
                            </span>
                        </div>
                        <div className="min-h-0 flex-1">
                            <CodePane
                                value={state.program}
                                language="jq"
                                path="program"
                                label="jq program"
                                errors={result?.errors}
                                onChange={(program) => update({ program })}
                                onRun={runNow}
                                fontSize={14}
                            />
                        </div>
                    </section>
                    <OutputPanel result={result} running={running} raw={raw} className="min-h-48 flex-1" />
                </div>
            </div>
        </div>
    )
}
