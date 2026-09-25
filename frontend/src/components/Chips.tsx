import type { CSSProperties } from 'react'

import { chipStyle, levelHue, levelName, SOURCE_LABELS } from '@/lib/levels'
import type { Level, SourceKind } from '@/lib/types'
import { cn } from '@/lib/utils'

export function Chip({
    hue,
    children,
    className,
}: {
    hue: string
    children: React.ReactNode
    className?: string
}) {
    return (
        <span className={cn('chip', className)} style={chipStyle(hue) as CSSProperties}>
            {children}
        </span>
    )
}

export function LevelChip({ level, long = false }: { level: Level; long?: boolean }) {
    return (
        <Chip hue={levelHue(level)}>
            jq {level}
            {long ? ` ${levelName(level)}` : ''}
        </Chip>
    )
}

export function SourceChip({ source }: { source: SourceKind | 'inline' }) {
    const { label, hue } = SOURCE_LABELS[source]
    return <Chip hue={hue}>{label}</Chip>
}
