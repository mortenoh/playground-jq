import { describe, expect, it } from 'vitest'

import { parseAnsi } from '@/lib/ansi'

describe('parseAnsi', () => {
    it('splits jq -C output into styled runs', () => {
        const text =
            '\u001b[1;39m{\u001b[0m\u001b[1;34m"a"\u001b[0m\u001b[1;39m:\u001b[0m \u001b[0;32m"x"\u001b[0m'
        expect(parseAnsi(text)).toEqual([
            { text: '{', bold: true, color: null },
            { text: '"a"', bold: true, color: 34 },
            { text: ':', bold: true, color: null },
            { text: ' ', bold: false, color: null },
            { text: '"x"', bold: false, color: 32 },
        ])
    })

    it('keeps text without escapes as one run', () => {
        expect(parseAnsi('plain')).toEqual([{ text: 'plain', bold: false, color: null }])
    })
})
