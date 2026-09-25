import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import { useTheme } from 'next-themes'
import { useEffect, useRef } from 'react'

import { builtins, completionNames } from '@/lib/builtins'
import { JQ_BUILTINS_FALLBACK, jqMonarch, wordAt } from '@/lib/jq-grammar'
import type { Builtin, JqError } from '@/lib/types'
import { cn } from '@/lib/utils'

import 'monaco-editor/esm/vs/editor/contrib/suggest/browser/suggestController'
import 'monaco-editor/esm/vs/editor/contrib/hover/browser/hoverContribution'
import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController'
import 'monaco-editor/esm/vs/editor/contrib/folding/browser/folding'
import 'monaco-editor/esm/vs/editor/contrib/bracketMatching/browser/bracketMatching'
import 'monaco-editor/esm/vs/editor/contrib/comment/browser/comment'
import 'monaco-editor/esm/vs/language/json/monaco.contribution'

/**
 * The editor for programs (jq), inputs (JSON or text) and outputs (read-only).
 *
 * Only the editor API and the contributions used here are imported, so the chunk stays as small
 * as Monaco allows. jq is registered as a Monarch language (grammar in `lib/jq-grammar`), with
 * completion and hover from the server's builtin catalogue. Compile errors from a run arrive as
 * markers. Loaded only through `CodePane`, in its own chunk.
 */

const environment: monaco.Environment = {
    getWorker(_workerId: string, label: string) {
        if (label === 'json') return new jsonWorker()
        return new editorWorker()
    },
}
;(self as unknown as { MonacoEnvironment: monaco.Environment }).MonacoEnvironment = environment

monaco.languages.register({ id: 'jq', extensions: ['.jq'], aliases: ['jq'] })
monaco.languages.setMonarchTokensProvider(
    'jq',
    jqMonarch(JQ_BUILTINS_FALLBACK) as monaco.languages.IMonarchLanguage,
)
monaco.languages.setLanguageConfiguration('jq', {
    comments: { lineComment: '#' },
    brackets: [
        ['{', '}'],
        ['[', ']'],
        ['(', ')'],
    ],
    autoClosingPairs: [
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: '(', close: ')' },
        { open: '"', close: '"', notIn: ['string'] },
    ],
    surroundingPairs: [
        { open: '(', close: ')' },
        { open: '[', close: ']' },
        { open: '{', close: '}' },
        { open: '"', close: '"' },
    ],
    wordPattern: /[$@]?[A-Za-z_][A-Za-z0-9_]*/,
})

/** Builtins by name, filled once the catalogue has loaded. */
const catalogue = new Map<string, Builtin>()

function documentation(builtin: Builtin): monaco.IMarkdownString {
    return {
        value: `${builtin.summary}\n\n[jq manual: ${builtin.section}](${builtin.manual})`,
        isTrusted: false,
    }
}

void builtins().then((loaded) => {
    for (const builtin of loaded) catalogue.set(builtin.name, builtin)
    const names = completionNames(loaded).filter((name) => /^[A-Za-z_]/.test(name))
    monaco.languages.setMonarchTokensProvider('jq', jqMonarch(names) as monaco.languages.IMonarchLanguage)
})

monaco.languages.registerCompletionItemProvider('jq', {
    triggerCharacters: ['@', '$'],
    provideCompletionItems(model, position) {
        const word = model.getWordUntilPosition(position)
        const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn,
        }
        const suggestions: monaco.languages.CompletionItem[] = [...catalogue.values()].map((builtin) => ({
            label: builtin.name,
            kind: builtin.name.startsWith('@')
                ? monaco.languages.CompletionItemKind.Constant
                : monaco.languages.CompletionItemKind.Function,
            detail: builtin.signatures.join('  |  '),
            documentation: documentation(builtin),
            insertText: builtin.name,
            range,
        }))
        return { suggestions }
    },
})

monaco.languages.registerHoverProvider('jq', {
    provideHover(model, position) {
        const word = wordAt(model.getLineContent(position.lineNumber), position.column)
        if (word === null) return null
        const builtin = catalogue.get(word)
        if (builtin === undefined) return null
        return {
            contents: [{ value: '`' + builtin.signatures.join('`, `') + '`' }, documentation(builtin)],
        }
    },
})

/** One CSS colour as Monaco takes it, resolved by the browser (handles oklch). */
function resolvedColor(reference: string): string {
    const probe = document.createElement('span')
    probe.style.color = reference
    probe.style.display = 'none'
    document.body.appendChild(probe)
    const said = getComputedStyle(probe).color
    probe.remove()
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const paint = canvas.getContext('2d')
    if (paint === null) return '#808080'
    paint.fillStyle = said
    paint.fillRect(0, 0, 1, 1)
    const [r, g, b] = paint.getImageData(0, 0, 1, 1).data
    return `#${[r, g, b].map((part) => part.toString(16).padStart(2, '0')).join('')}`
}

/** The house theme, read from the live page's custom properties. */
function houseTheme(dark: boolean): monaco.editor.IStandaloneThemeData {
    const ink = {
        ground: resolvedColor('var(--color-field)'),
        text: resolvedColor('var(--color-foreground)'),
        quiet: resolvedColor('var(--color-muted-foreground)'),
        key: resolvedColor('var(--color-info-ink)'),
        string: resolvedColor('var(--color-good-ink)'),
        number: resolvedColor('var(--color-warning-ink)'),
        accent: resolvedColor('var(--color-accent)'),
        accentInk: resolvedColor('var(--color-accent-foreground)'),
        raised: resolvedColor('var(--color-popover)'),
        hovered: resolvedColor('var(--color-muted)'),
        raisedInk: resolvedColor('var(--color-popover-foreground)'),
        edge: resolvedColor('var(--color-border)'),
        binding: resolvedColor('var(--color-kind-violet-ink)'),
        builtin: resolvedColor('var(--color-kind-teal-ink)'),
        format: resolvedColor('var(--color-kind-pink-ink)'),
        critical: resolvedColor('var(--color-critical)'),
    }
    return {
        base: dark ? 'vs-dark' : 'vs',
        inherit: true,
        rules: [
            { token: 'string.key.json', foreground: ink.key },
            { token: 'string.value.json', foreground: ink.string },
            { token: 'number.json', foreground: ink.number },
            { token: 'keyword.json', foreground: ink.number },
            { token: 'delimiter.bracket.json', foreground: ink.quiet },
            { token: 'delimiter.array.json', foreground: ink.quiet },
            { token: 'delimiter.colon.json', foreground: ink.quiet },
            { token: 'delimiter.comma.json', foreground: ink.quiet },
            { token: 'type', foreground: ink.key },
            { token: 'predefined', foreground: ink.builtin },
            { token: 'variable.binding', foreground: ink.binding },
            { token: 'keyword.format', foreground: ink.format },
            { token: 'string', foreground: ink.string },
            { token: 'string.escape', foreground: ink.number },
            { token: 'number', foreground: ink.number },
            { token: 'keyword', foreground: ink.number, fontStyle: 'bold' },
            { token: 'comment', foreground: ink.quiet, fontStyle: 'italic' },
            { token: 'delimiter', foreground: ink.quiet },
            { token: 'operator', foreground: ink.quiet },
        ],
        colors: {
            'editor.background': ink.ground,
            'editor.foreground': ink.text,
            'editorLineNumber.foreground': ink.quiet,
            'editorLineNumber.activeForeground': ink.text,
            'editor.selectionBackground': ink.accent,
            'editorCursor.foreground': ink.text,
            'editor.lineHighlightBackground': ink.hovered,
            'editor.lineHighlightBorder': ink.ground,
            'editorWidget.background': ink.raised,
            'editorWidget.foreground': ink.raisedInk,
            'editorWidget.border': ink.edge,
            'editorHoverWidget.background': ink.raised,
            'editorHoverWidget.border': ink.edge,
            'editorSuggestWidget.background': ink.raised,
            'editorSuggestWidget.foreground': ink.raisedInk,
            'editorSuggestWidget.border': ink.edge,
            'editorSuggestWidget.selectedBackground': ink.accent,
            'editorSuggestWidget.selectedForeground': ink.accentInk,
            'editorSuggestWidget.highlightForeground': ink.key,
            'editorError.foreground': ink.critical,
            'list.hoverBackground': ink.hovered,
            'list.hoverForeground': ink.raisedInk,
        },
    }
}

/** Themes are rebuilt when the mode flips; every editor shares the one named theme. */
function applyTheme(): void {
    monaco.editor.defineTheme('pjq', houseTheme(document.documentElement.classList.contains('dark')))
    monaco.editor.setTheme('pjq')
}

export type EditorLanguage = 'jq' | 'json' | 'plaintext'

export interface CodeEditorProps {
    value: string
    language: EditorLanguage
    /** Names the buffer; each path gets its own model. */
    path: string
    /** What a screen reader and a test call this editor. */
    label: string
    readOnly?: boolean
    /** Errors from the last run, drawn as markers (compile errors carry a location). */
    errors?: JqError[]
    className?: string
    wordWrap?: boolean
    lineNumbers?: boolean
    fontSize?: number
    onChange?: (text: string) => void
    /** Cmd/Ctrl+Enter. */
    onRun?: () => void
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
    fontSize = 13,
    onChange,
    onRun,
}: CodeEditorProps) {
    const host = useRef<HTMLDivElement | null>(null)
    const editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
    const emitted = useRef(value)
    const changed = useRef(onChange)
    const run = useRef(onRun)
    const { resolvedTheme } = useTheme()

    changed.current = onChange
    run.current = onRun

    useEffect(() => {
        if (host.current === null) return
        const uri = monaco.Uri.parse(`inmemory://pjq/${path}.${language === 'plaintext' ? 'txt' : language}`)
        const model = monaco.editor.getModel(uri) ?? monaco.editor.createModel(value, language, uri)
        emitted.current = value
        if (model.getValue() !== value) model.setValue(value)
        const large = value.length > 1_000_000
        const created = monaco.editor.create(host.current, {
            model,
            automaticLayout: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            fontSize,
            fontFamily: "'IBM Plex Mono', 'SF Mono', Menlo, Consolas, monospace",
            lineNumbers: lineNumbers ? 'on' : 'off',
            tabSize: 2,
            renderLineHighlight: readOnly ? 'none' : 'line',
            bracketPairColorization: { enabled: false },
            scrollbar: { alwaysConsumeMouseWheel: false },
            wordWrap: wordWrap ? 'on' : 'off',
            folding: !large,
            glyphMargin: language === 'jq',
            ariaLabel: label,
            readOnly,
            domReadOnly: readOnly,
            fixedOverflowWidgets: true,
            quickSuggestions: language === 'jq' ? { other: true, strings: false, comments: false } : false,
        })
        editor.current = created
        created.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => run.current?.())
        const watch = model.onDidChangeContent(() => {
            const text = model.getValue()
            // A value handed in from outside is already what the caller holds; only edits are news.
            if (text === emitted.current) return
            emitted.current = text
            changed.current?.(text)
        })
        applyTheme()
        return () => {
            watch.dispose()
            created.dispose()
            model.dispose()
        }
        // The editor is created once per buffer; later values flow in through the effect below.
        // oxlint-disable-next-line react/exhaustive-deps
    }, [path, language])

    useEffect(() => {
        const model = editor.current?.getModel()
        if (model === null || model === undefined) return
        if (value === emitted.current || value === model.getValue()) return
        emitted.current = value
        model.setValue(value)
    }, [value])

    useEffect(() => {
        editor.current?.updateOptions({ wordWrap: wordWrap ? 'on' : 'off' })
    }, [wordWrap])

    useEffect(() => {
        const model = editor.current?.getModel()
        if (model === null || model === undefined) return
        const markers: monaco.editor.IMarkerData[] = (errors ?? [])
            .filter((error) => error.kind === 'compile' && error.line !== null)
            .map((error) => {
                const line = Math.min(error.line ?? 1, model.getLineCount())
                const start = error.column ?? 1
                const end = error.end_column ?? model.getLineMaxColumn(line)
                return {
                    severity: monaco.MarkerSeverity.Error,
                    message: error.message,
                    startLineNumber: line,
                    startColumn: start,
                    endLineNumber: line,
                    endColumn: Math.max(end, start + 1),
                }
            })
        monaco.editor.setModelMarkers(model, 'jq', markers)
    }, [errors])

    useEffect(() => {
        const frame = requestAnimationFrame(applyTheme)
        return () => {
            cancelAnimationFrame(frame)
        }
    }, [resolvedTheme])

    return (
        <div ref={host} className={cn('h-full min-h-24 w-full', className)} data-testid={`editor-${path}`} />
    )
}
