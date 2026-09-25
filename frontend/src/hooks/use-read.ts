/**
 * One read: the function's identity is the question, so a new function discards the old answer.
 * Asking the same question again keeps the last answer on screen until the new one lands.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'

import { ApiError, type Problem } from '@/lib/api'

export interface Answer<T> {
    value: T | null
    problem: Problem | null
    reading: boolean
    read: boolean
}

const UNREAD = { value: null, problem: null, reading: true, read: false }

export interface Reading<T> extends Answer<T> {
    again: () => void
}

export function useRead<T>(read: () => Promise<T>): Reading<T> {
    const [round, setRound] = useState(0)
    const [held, setHeld] = useState<{ asked: unknown; answer: Answer<T> }>(() => ({
        asked: null,
        answer: UNREAD,
    }))

    const question = useMemo(() => ({ read, round }), [read, round])
    const stale = held.asked !== null && (held.asked as { read: unknown }).read === question.read
    const answer =
        held.asked === question
            ? held.answer
            : stale
              ? { ...held.answer, reading: true }
              : (UNREAD as Answer<T>)

    useEffect(() => {
        let wanted = true
        void question.read().then(
            (value) => {
                if (wanted)
                    setHeld({ asked: question, answer: { value, problem: null, reading: false, read: true } })
            },
            (error: unknown) => {
                if (!wanted) return
                const problem =
                    error instanceof ApiError
                        ? error.problem
                        : {
                              status: 0,
                              title: 'Error',
                              detail: String(error),
                              code: 'client.error',
                              problems: [],
                              instance: null,
                          }
                setHeld({ asked: question, answer: { value: null, problem, reading: false, read: true } })
            },
        )
        return () => {
            wanted = false
        }
    }, [question])

    const again = useCallback(() => {
        setRound((count) => count + 1)
    }, [])

    return { ...answer, again }
}
