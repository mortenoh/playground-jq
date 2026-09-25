import { ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, Eye, Lightbulb, Play } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'

import { LevelChip } from '@/components/Chips'
import { CodePane } from '@/components/editor/CodePane'
import { Markdown } from '@/components/Markdown'
import { Loading, ProblemNote } from '@/components/PageState'
import { OutputPanel } from '@/components/playground/OutputPanel'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useRead } from '@/hooks/use-read'
import { useStore } from '@/hooks/use-store'
import { ApiError } from '@/lib/api'
import { checkStep, getTutorial, resolveInput, runProgram } from '@/lib/client'
import { compareOutputs } from '@/lib/diff'
import { markSolved, progress } from '@/lib/progress'
import type { RunResult, StepCheckResult } from '@/lib/types'
import { cn } from '@/lib/utils'

/** Drafts per step, so moving between steps keeps what was typed. */
const drafts = new Map<string, string>()

export default function TutorialPage() {
    const { id = '', step = '1' } = useParams()
    const number = Math.max(1, Number(step) || 1)
    const navigate = useNavigate()
    const read = useCallback(() => getTutorial(id), [id])
    const tutorial = useRead(read)
    const held = useStore(progress)
    const [dataset, setDataset] = useState('')
    const [program, setProgram] = useState('.')
    const [preview, setPreview] = useState<RunResult | null>(null)
    const [checked, setChecked] = useState<StepCheckResult | null>(null)
    const [hints, setHints] = useState(0)
    const [showSolution, setShowSolution] = useState(false)
    const [busy, setBusy] = useState(false)
    const sequence = useRef(0)

    const value = tutorial.value
    const current = value?.steps[number - 1]
    const key = `${id}/${String(number)}`

    useEffect(() => {
        if (value === null) return
        void resolveInput(value.input).then(({ text }) => setDataset(text))
    }, [value])

    // A new step starts from its draft or starter, with hints and the verdict cleared.
    const [shownKey, setShownKey] = useState<string | null>(null)
    if (current !== undefined && shownKey !== key) {
        setShownKey(key)
        setProgram(drafts.get(key) ?? current.starter)
        setChecked(null)
        setHints(0)
        setShowSolution(false)
    }

    useEffect(() => {
        if (current === undefined || dataset === '') return
        const ticket = ++sequence.current
        const timer = setTimeout(() => {
            void runProgram({ program, input: dataset, options: current.options }).then((result) => {
                if (ticket === sequence.current) setPreview(result)
            })
        }, 300)
        return () => {
            clearTimeout(timer)
        }
    }, [program, dataset, current])

    async function check(): Promise<void> {
        if (current === undefined) return
        setBusy(true)
        try {
            const answer = await checkStep(id, number, program)
            setChecked(answer)
            if (answer.passed) {
                markSolved(id, number)
                toast.success('Solved', { description: current.title })
            }
        } catch (error) {
            toast.error(error instanceof ApiError ? error.problem.detail : String(error))
        } finally {
            setBusy(false)
        }
    }

    if (tutorial.problem !== null) return <ProblemNote problem={tutorial.problem} />
    if (value === null) return <Loading what="the tutorial" />
    if (current === undefined)
        return (
            <ProblemNote
                problem={{
                    status: 404,
                    title: 'No such step',
                    detail: `This tutorial has ${String(value.steps.length)} steps.`,
                    code: 'client.no_step',
                    problems: [],
                    instance: null,
                }}
            />
        )

    const solved = new Set(held[id] ?? [])
    const comparison =
        checked !== null && !checked.passed && checked.result.ok
            ? compareOutputs(checked.expected, checked.result.outputs, { unordered: current.unordered })
            : null
    const goto = (target: number) => navigate(`/learn/${id}/${String(target)}`)

    return (
        <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[minmax(22rem,2fr)_3fr]">
            <aside className="flex min-h-0 flex-col border-b lg:border-r lg:border-b-0">
                <div className="flex shrink-0 items-center gap-2 border-b px-4 py-2">
                    <Link
                        to="/learn"
                        className="text-muted-foreground hover:text-foreground"
                        aria-label="All tutorials"
                    >
                        <ArrowLeft className="size-4" />
                    </Link>
                    <span className="flex-1 truncate text-sm font-semibold">{value.title}</span>
                    <LevelChip level={value.level} />
                </div>
                <ol className="flex shrink-0 flex-wrap gap-1 border-b px-4 py-2" aria-label="Steps">
                    {value.steps.map((entry, index) => (
                        <li key={index}>
                            <Link
                                to={`/learn/${id}/${String(index + 1)}`}
                                title={entry.title}
                                className={cn(
                                    'flex size-7 items-center justify-center rounded-md border font-mono text-xs',
                                    index + 1 === number && 'border-primary bg-accent text-accent-foreground',
                                    solved.has(index + 1) &&
                                        index + 1 !== number &&
                                        'border-good/50 bg-good/10 text-good-ink',
                                )}
                            >
                                {index + 1}
                            </Link>
                        </li>
                    ))}
                </ol>
                <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
                    <p className="text-xs text-muted-foreground">
                        Step {number} of {value.steps.length}
                    </p>
                    <h1 className="text-lg font-semibold">{current.title}</h1>
                    <Markdown text={current.body} className="mt-2" />
                    <div className="mt-4 rounded-md border border-primary/40 bg-accent/40 p-3">
                        <p className="text-xs font-semibold tracking-wide text-accent-foreground uppercase">
                            Your task
                        </p>
                        <Markdown text={current.task} className="mt-1" />
                    </div>
                    <div className="mt-4 space-y-2">
                        {current.hints.slice(0, hints).map((hint, index) => (
                            <div key={index} className="flex gap-2 rounded-md bg-muted/60 p-2 text-sm">
                                <Lightbulb className="mt-0.5 size-4 shrink-0 text-warning-ink" aria-hidden />
                                <Markdown text={hint} />
                            </div>
                        ))}
                        <div className="flex flex-wrap gap-2">
                            {hints < current.hints.length && (
                                <Button variant="outline" size="sm" onClick={() => setHints(hints + 1)}>
                                    <Lightbulb /> {hints === 0 ? 'Show a hint' : 'Another hint'}
                                </Button>
                            )}
                            <Button variant="ghost" size="sm" onClick={() => setShowSolution(!showSolution)}>
                                <Eye /> {showSolution ? 'Hide the solution' : 'Show the solution'}
                            </Button>
                        </div>
                        {showSolution && (
                            <div className="rounded-md border p-2">
                                <pre className="font-mono text-sm whitespace-pre-wrap" data-testid="solution">
                                    {current.solution}
                                </pre>
                                <Button
                                    variant="link"
                                    size="xs"
                                    className="px-0"
                                    onClick={() => setProgram(current.solution)}
                                >
                                    Use it
                                </Button>
                            </div>
                        )}
                    </div>
                    {checked?.passed === true && current.why !== '' && (
                        <div className="mt-4 rounded-md border border-good/40 bg-good/10 p-3">
                            <p className="flex items-center gap-1 text-sm font-semibold text-good-ink">
                                <CheckCircle2 className="size-4" aria-hidden /> Why it works
                            </p>
                            <Markdown text={current.why} className="mt-1" />
                        </div>
                    )}
                </div>
                <div className="flex shrink-0 items-center justify-between border-t px-4 py-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        disabled={number <= 1}
                        onClick={() => void goto(number - 1)}
                    >
                        <ChevronLeft /> Previous
                    </Button>
                    {number < value.steps.length ? (
                        <Button
                            variant={checked?.passed === true ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => void goto(number + 1)}
                        >
                            Next <ChevronRight />
                        </Button>
                    ) : (
                        <Button
                            variant={checked?.passed === true ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => void navigate('/learn')}
                        >
                            Finish <ChevronRight />
                        </Button>
                    )}
                </div>
            </aside>
            <div className="flex min-h-0 flex-col">
                <section
                    className="flex h-[30%] min-h-28 shrink-0 flex-col border-b"
                    aria-label="Your program"
                >
                    <div className="flex h-9 shrink-0 items-center gap-2 border-b px-2">
                        <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                            Your program
                        </span>
                        <div className="ml-auto flex items-center gap-2">
                            {checked !== null && (
                                <span
                                    className={cn(
                                        'text-sm',
                                        checked.passed ? 'text-good-ink' : 'text-critical-ink',
                                    )}
                                    data-testid="check-verdict"
                                >
                                    {checked.passed ? 'Correct' : (comparison?.summary ?? 'Not yet')}
                                </span>
                            )}
                            <Button size="sm" onClick={() => void check()} disabled={busy}>
                                <Play /> Check
                            </Button>
                        </div>
                    </div>
                    <div className="min-h-0 flex-1">
                        <CodePane
                            value={program}
                            language="jq"
                            path="tutorial-program"
                            label="Your jq program"
                            errors={preview?.errors}
                            fontSize={14}
                            onChange={(text) => {
                                drafts.set(key, text)
                                setProgram(text)
                                setChecked(null)
                            }}
                            onRun={() => void check()}
                        />
                    </div>
                </section>
                <Tabs defaultValue="output" className="flex min-h-0 flex-1 flex-col gap-0">
                    <TabsList variant="line" className="h-9 shrink-0 border-b px-2">
                        <TabsTrigger value="output">Your output</TabsTrigger>
                        <TabsTrigger value="expected">Expected</TabsTrigger>
                        <TabsTrigger value="data">Dataset</TabsTrigger>
                    </TabsList>
                    <TabsContent value="output" className="min-h-0 flex-1">
                        <OutputPanel
                            result={preview}
                            running={false}
                            path="tutorial-output"
                            raw={current.options.raw_output}
                            className="h-full"
                        />
                    </TabsContent>
                    <TabsContent value="expected" className="min-h-0 flex-1">
                        <CodePane
                            value={(current.expected ?? [])
                                .map((item) => JSON.stringify(item, null, 2))
                                .join('\n')}
                            language="json"
                            path="tutorial-expected"
                            label="Expected output"
                            readOnly
                        />
                    </TabsContent>
                    <TabsContent value="data" className="min-h-0 flex-1">
                        <CodePane
                            value={dataset}
                            language="json"
                            path="tutorial-dataset"
                            label="Dataset"
                            readOnly
                        />
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    )
}
