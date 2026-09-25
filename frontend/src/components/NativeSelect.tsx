import type { SelectHTMLAttributes } from 'react'

import { cn } from '@/lib/utils'

/** A native select in the house style: accessible, keyboard-friendly, and testable. */
export function NativeSelect({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
    return (
        <select
            className={cn(
                'h-8 rounded-md border border-input bg-field px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50',
                className,
            )}
            {...rest}
        >
            {children}
        </select>
    )
}
