import { describe, expect, it } from 'vitest'

import { formatJson } from '@/lib/format'

describe('formatJson', () => {
    it('indents and keeps number arrays on one line', () => {
        expect(formatJson('{"c":[[1,2.5],[3,4]],"e":[],"f":{}}')).toBe(
            '{\n  "c": [\n    [1, 2.5],\n    [3, 4]\n  ],\n  "e": [],\n  "f": {}\n}\n',
        )
    })

    it('refuses text that is not one JSON value', () => {
        expect(formatJson('{')).toBeNull()
        expect(formatJson('1 2')).toBeNull()
    })
})
