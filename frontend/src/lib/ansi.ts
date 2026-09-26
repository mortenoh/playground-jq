/** ANSI SGR escape codes (as `jq -C` writes them) split into styled runs of text. */

export interface Run {
    text: string
    bold: boolean
    /** An SGR foreground colour code (30-37, 90-97), or null for the default. */
    color: number | null
}

/** One SGR sequence: ESC [ codes m. Built from the character code, since ESC cannot appear in a literal. */
const SGR = new RegExp(`${String.fromCharCode(27)}\\[([0-9;]*)m`, 'g')

export function parseAnsi(text: string): Run[] {
    const runs: Run[] = []
    let bold = false
    let color: number | null = null
    let cursor = 0
    for (const match of text.matchAll(SGR)) {
        if (match.index > cursor) runs.push({ text: text.slice(cursor, match.index), bold, color })
        cursor = match.index + match[0].length
        const codes = (match[1] ?? '')
            .split(';')
            .filter((code) => code !== '')
            .map(Number)
        if (codes.length === 0) codes.push(0)
        for (const code of codes) {
            if (code === 0) {
                bold = false
                color = null
            } else if (code === 1) bold = true
            else if (code === 22) bold = false
            else if (code === 39) color = null
            else if ((code >= 30 && code <= 37) || (code >= 90 && code <= 97)) color = code
        }
    }
    if (cursor < text.length) runs.push({ text: text.slice(cursor), bold, color })
    return runs
}
