/**
 * Palettes: a second theme axis beside light/dark. The palette is written as `data-theme` on
 * the root element (index.html does it before the first paint from the same storage key), and
 * index.css holds each palette's tokens for both modes.
 */

import { createStore } from '@/lib/store'

export const PALETTES = [
    { id: 'default', label: 'Default', blurb: 'Cool neutral surfaces, amber for action' },
    { id: 'paper', label: 'Paper', blurb: 'Warm paper tones, easy on the eyes' },
    { id: 'ocean', label: 'Ocean', blurb: 'Blue-grey surfaces, teal accent' },
    { id: 'contrast', label: 'High contrast', blurb: 'Maximum contrast for readability' },
] as const

export type PaletteId = (typeof PALETTES)[number]['id']

export const PALETTE_KEY = 'pjq.palette'

function initial(): PaletteId {
    try {
        const held = localStorage.getItem(PALETTE_KEY)
        if (PALETTES.some((palette) => palette.id === held)) return held as PaletteId
    } catch {
        // Storage denied: the default palette.
    }
    return 'default'
}

export const palette = createStore<PaletteId>(typeof localStorage === 'undefined' ? 'default' : initial())

/** Switch palette, remember it, and write it on the root element. */
export function setPalette(id: PaletteId): void {
    palette.set(id)
    try {
        localStorage.setItem(PALETTE_KEY, id)
    } catch {
        // Storage denied: the palette lasts for this page.
    }
    document.documentElement.setAttribute('data-theme', id)
}
