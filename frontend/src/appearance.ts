import type { ThemeSettings } from '@winterop-com/sokkel-ui/lib/appearance'

/**
 * The look before anything is chosen: the amber theme, the closest to the playground's own
 * palette before it moved onto sokkel-ui, in the system's scheme. Shared by `useAppearance` in
 * the frame and by the script `vite.config.ts` writes into the page, so both start in one look.
 */
export const APPEARANCE_DEFAULTS: Partial<ThemeSettings> = { theme: 'amber' }
