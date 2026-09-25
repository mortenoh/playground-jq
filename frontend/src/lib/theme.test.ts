import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { PALETTE_KEY, PALETTES } from '@/lib/theme'

describe('palettes', () => {
    it('index.html knows every palette and the storage key', () => {
        const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8')
        for (const { id } of PALETTES) expect(html).toContain(`'${id}'`)
        expect(html).toContain(PALETTE_KEY)
    })

    it('index.css defines every palette but the default, in both modes', () => {
        const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8')
        for (const { id } of PALETTES.filter((entry) => entry.id !== 'default')) {
            expect(css).toContain(`html[data-theme='${id}']`)
            expect(css).toContain(`html.dark[data-theme='${id}']`)
        }
    })
})
