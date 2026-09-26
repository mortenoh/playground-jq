import { useMemo } from 'react'

import { parseAnsi } from '@/lib/ansi'

/** The eight ANSI colours (and their bright variants) in the house palette's inks. */
const INK: Record<number, string> = {
    30: 'var(--color-foreground)',
    31: 'var(--color-critical-ink)',
    32: 'var(--color-good-ink)',
    33: 'var(--color-warning-ink)',
    34: 'var(--color-info-ink)',
    35: 'var(--color-kind-violet-ink)',
    36: 'var(--color-kind-teal-ink)',
    37: 'var(--color-muted-foreground)',
    90: 'var(--color-faint)',
    91: 'var(--color-critical)',
    92: 'var(--color-good)',
    93: 'var(--color-warning)',
    94: 'var(--color-info)',
    95: 'var(--color-kind-violet)',
    96: 'var(--color-kind-teal)',
    97: 'var(--color-foreground)',
}

/** Text with ANSI colour codes, as a terminal would show it. */
export function AnsiText({ text }: { text: string }) {
    const runs = useMemo(() => parseAnsi(text), [text])
    return (
        <pre className="h-full overflow-auto p-3 font-mono text-[13px] leading-5" data-testid="ansi-output">
            {runs.map((run, index) => (
                <span
                    key={index}
                    style={{
                        color: run.color === null ? undefined : INK[run.color],
                        fontWeight: run.bold ? 600 : undefined,
                    }}
                >
                    {run.text}
                </span>
            ))}
        </pre>
    )
}
