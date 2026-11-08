import { useCallback, useEffect, useMemo, useState } from 'react'

import { CodeEditor as Editor, type CodeCompletion, type CodeMark } from '@winterop-com/sokkel-ui/CodeEditor'

import { builtins } from '@/lib/builtins'
import type { Builtin, JqError } from '@/lib/types'
import { cn } from '@winterop-com/sokkel-ui/lib/cn'

/**
 * The editor for programs (jq), inputs (JSON or text) and outputs (read-only): sokkel-ui's
 * CodeEditor on CodeMirror. jq completes and explains its builtins from the server's catalogue,
 * compile errors from a run are underlined where jq places them, and Cmd/Ctrl+Enter runs. Loaded
 * only through `CodePane`, in its own chunk.
 */

export type EditorLanguage = 'jq' | 'json' | 'plaintext'

export interface CodeEditorProps {
    value: string
    language: EditorLanguage
    /** Names the buffer, for tests to find it by (`editor-<path>`). */
    path: string
    /** What a screen reader and a test call this editor. */
    label: string
    readOnly?: boolean
    /** Errors from the last run; compile errors carry a location and are underlined there. */
    errors?: JqError[]
    className?: string
    wordWrap?: boolean
    lineNumbers?: boolean
    /** `md` for the program a person writes, `sm` for denser panes. */
    size?: 'sm' | 'md'
    onChange?: (text: string) => void
    /** Cmd/Ctrl+Enter. */
    onRun?: () => void
}

/** The builtin catalogue by name, once it has loaded; empty until then. */
function useCatalogue(enabled: boolean): Map<string, Builtin> {
    const [catalogue, setCatalogue] = useState<Map<string, Builtin>>(() => new Map())
    useEffect(() => {
        if (!enabled) return
        let live = true
        void builtins()
            .then((loaded) => {
                if (live) setCatalogue(new Map(loaded.map((builtin) => [builtin.name, builtin])))
            })
            .catch(() => undefined)
        return () => {
            live = false
        }
    }, [enabled])
    return catalogue
}

function BuiltinHover({ builtin }: { builtin: Builtin }) {
    return (
        <div className="max-w-sm space-y-1 p-1 text-xs">
            <p className="font-mono">{builtin.signatures.join(', ')}</p>
            <p className="text-muted-foreground">{builtin.summary}</p>
            <a className="text-primary-ink underline" href={builtin.manual} target="_blank" rel="noreferrer">
                jq manual: {builtin.section}
            </a>
        </div>
    )
}

/**
 * A compile error as a mark: the range jq names on its line, or the whole line without columns. jq
 * may place an error just past the end (an unclosed bracket); that lands on the last line, as a
 * wash of the whole line, so it is never dropped.
 */
function markOf(error: JqError, lines: readonly string[]): CodeMark | null {
    if (error.kind !== 'compile' || error.line === null) return null
    if (error.line > lines.length) return { line: lines.length, tone: 'error', message: error.message }
    if (error.column === null) return { line: error.line, tone: 'error', message: error.message }
    const end = lines[error.line - 1].length + 1
    if (error.column >= end) return { line: error.line, tone: 'error', message: error.message }
    const to = Math.min(Math.max(error.end_column ?? error.column + 1, error.column + 1), end)
    return { line: error.line, from: error.column, to, tone: 'error', message: error.message }
}

export function CodeEditor({
    value,
    language,
    path,
    label,
    readOnly = false,
    errors,
    className,
    wordWrap = false,
    lineNumbers = true,
    size = 'sm',
    onChange,
    onRun,
}: CodeEditorProps) {
    const jq = language === 'jq'
    const catalogue = useCatalogue(jq)

    const completions = useMemo<CodeCompletion[]>(
        () =>
            [...catalogue.values()].map((builtin) => ({
                label: builtin.name,
                detail: builtin.signatures.join('  |  '),
                docs: builtin.summary,
                kind: builtin.name.startsWith('@') ? 'constant' : 'function',
            })),
        [catalogue],
    )

    const marks = useMemo(() => {
        const lines = value.split('\n')
        return (errors ?? [])
            .map((error) => markOf(error, lines))
            .filter((mark): mark is CodeMark => mark !== null)
    }, [errors, value])

    const hover = useCallback(
        (word: string) => {
            const builtin = catalogue.get(word)
            return builtin === undefined ? null : <BuiltinHover builtin={builtin} />
        },
        [catalogue],
    )

    return (
        <div className={cn('h-full min-h-24 w-full', className)} data-testid={`editor-${path}`}>
            <Editor
                value={value}
                onChange={onChange}
                language={language === 'plaintext' ? 'text' : language}
                readOnly={readOnly}
                lineNumbers={lineNumbers}
                wrap={wordWrap}
                marks={marks}
                completions={jq && !readOnly ? completions : undefined}
                hover={jq ? hover : undefined}
                onRun={onRun === undefined ? undefined : () => onRun()}
                search
                folding={language === 'json'}
                bracketColors={language !== 'plaintext'}
                size={size}
                variant="pane"
                label={label}
                className="h-full"
            />
        </div>
    )
}
