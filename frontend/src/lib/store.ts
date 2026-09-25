/**
 * A tiny module-level store: a value, and the components that read it re-render when it changes.
 * `hooks/use-store` reads one with `useSyncExternalStore`.
 */

export interface Store<T> {
    get: () => T
    set: (value: T) => void
    update: (change: (value: T) => T) => void
    subscribe: (listener: () => void) => () => void
}

export function createStore<T>(initial: T): Store<T> {
    let value = initial
    const listeners = new Set<() => void>()
    return {
        get: () => value,
        set(next) {
            if (Object.is(next, value)) return
            value = next
            for (const listener of listeners) listener()
        },
        update(change) {
            this.set(change(value))
        },
        subscribe(listener) {
            listeners.add(listener)
            return () => {
                listeners.delete(listener)
            }
        },
    }
}

/** A store persisted to localStorage under a key; storage errors fall back to memory. */
export function persistedStore<T>(key: string, initial: T): Store<T> {
    let start = initial
    try {
        const raw = localStorage.getItem(key)
        if (raw !== null) start = JSON.parse(raw) as T
    } catch {
        // Storage denied or the value is not JSON: start from the initial value.
    }
    const store = createStore(start)
    store.subscribe(() => {
        try {
            localStorage.setItem(key, JSON.stringify(store.get()))
        } catch {
            // Storage denied or full: the value lives for this page only.
        }
    })
    return store
}
