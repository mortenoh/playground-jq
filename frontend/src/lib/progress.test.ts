import { describe, expect, it } from 'vitest'

import {
    history,
    HISTORY_LIMIT,
    markSolved,
    progress,
    remember,
    resetProgress,
    solvedCount,
} from '@/lib/progress'

describe('progress', () => {
    it('marks steps solved once each, in order', () => {
        resetProgress()
        markSolved('101-01', 3)
        markSolved('101-01', 1)
        markSolved('101-01', 3)
        expect(progress.get()['101-01']).toEqual([1, 3])
        expect(solvedCount(progress.get(), '101-01')).toBe(2)
        expect(solvedCount(progress.get(), 'other')).toBe(0)
    })
})

describe('history', () => {
    it('moves repeats to the top and keeps a bounded list', () => {
        history.set([])
        remember('.a')
        remember('.b')
        remember('.a')
        remember('   ')
        expect(history.get().map((entry) => entry.program)).toEqual(['.a', '.b'])
        for (let index = 0; index < HISTORY_LIMIT + 5; index += 1) remember(`.x${String(index)}`)
        expect(history.get()).toHaveLength(HISTORY_LIMIT)
    })
})
