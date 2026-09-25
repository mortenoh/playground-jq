import { useCallback, useRef, useState, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * Two panes with a draggable divider. The first pane's share (in percent) is remembered per
 * `id` in localStorage; double-clicking the divider restores the default. Keyboard: focus the
 * divider and use the arrow keys.
 */
export function Split({
    id,
    direction,
    initial = 50,
    min = 15,
    max = 85,
    first,
    second,
    className,
}: {
    id: string
    direction: 'horizontal' | 'vertical'
    initial?: number
    min?: number
    max?: number
    first: ReactNode
    second: ReactNode
    className?: string
}) {
    const key = `pjq.split.${id}`
    const [share, setShare] = useState(() => {
        try {
            const held = Number(localStorage.getItem(key))
            return held >= min && held <= max ? held : initial
        } catch {
            return initial
        }
    })
    const host = useRef<HTMLDivElement | null>(null)
    const horizontal = direction === 'horizontal'

    const commit = useCallback(
        (next: number) => {
            const clamped = Math.min(max, Math.max(min, next))
            setShare(clamped)
            try {
                localStorage.setItem(key, String(clamped))
            } catch {
                // Storage denied: the size lasts for this page.
            }
        },
        [key, min, max],
    )

    function startDrag(event: React.PointerEvent<HTMLDivElement>): void {
        event.preventDefault()
        const box = host.current?.getBoundingClientRect()
        if (box === undefined) return
        const move = (moved: PointerEvent) => {
            const offset = horizontal ? moved.clientX - box.left : moved.clientY - box.top
            commit((offset / (horizontal ? box.width : box.height)) * 100)
        }
        const stop = () => {
            window.removeEventListener('pointermove', move)
            window.removeEventListener('pointerup', stop)
            document.body.style.cursor = ''
            document.body.style.userSelect = ''
        }
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', stop)
        document.body.style.cursor = horizontal ? 'col-resize' : 'row-resize'
        document.body.style.userSelect = 'none'
    }

    return (
        <div
            ref={host}
            className={cn('flex min-h-0 min-w-0', horizontal ? 'flex-row' : 'flex-col', className)}
        >
            <div
                className="flex min-h-0 min-w-0 flex-col overflow-hidden"
                style={{ flexBasis: `${String(share)}%`, flexShrink: 0 }}
            >
                {first}
            </div>
            <div
                role="separator"
                aria-orientation={horizontal ? 'vertical' : 'horizontal'}
                aria-valuenow={Math.round(share)}
                aria-valuemin={min}
                aria-valuemax={max}
                aria-label="Resize"
                tabIndex={0}
                onPointerDown={startDrag}
                onDoubleClick={() => commit(initial)}
                onKeyDown={(event) => {
                    const step = event.shiftKey ? 10 : 2
                    if (event.key === (horizontal ? 'ArrowLeft' : 'ArrowUp')) commit(share - step)
                    if (event.key === (horizontal ? 'ArrowRight' : 'ArrowDown')) commit(share + step)
                }}
                className={cn(
                    'relative shrink-0 bg-border transition-colors outline-none hover:bg-primary/60 focus-visible:bg-primary',
                    horizontal ? 'w-px cursor-col-resize' : 'h-px cursor-row-resize',
                    // A wider invisible hit area around the 1px line.
                    horizontal
                        ? 'before:absolute before:inset-y-0 before:-left-1.5 before:w-3'
                        : 'before:absolute before:inset-x-0 before:-top-1.5 before:h-3',
                )}
            />
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{second}</div>
        </div>
    )
}
