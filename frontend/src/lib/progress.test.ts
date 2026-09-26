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

describe('persisted stores', () => {
    it('save once changes pause', async () => {
        const { persistedStore } = await import('@/lib/store')
        const writes: string[] = []
        const storage = {
            getItem: () => null,
            setItem: (key: string, value: string) => (key === 'debounced' ? writes.push(value) : 0),
        }
        Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true })
        const store = persistedStore('debounced', 0, 20)
        store.set(1)
        store.set(2)
        store.set(3)
        expect(writes).toEqual([])
        await new Promise((resolve) => setTimeout(resolve, 40))
        expect(writes).toEqual(['3'])
    })
})
