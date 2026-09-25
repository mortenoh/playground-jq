/** Run work once the browser is idle, or soon after where `requestIdleCallback` is missing. */
export function whenIdle(work: () => void): void {
    const idle = (globalThis as { requestIdleCallback?: (callback: () => void) => number })
        .requestIdleCallback
    if (idle !== undefined) {
        idle(work)
        return
    }
    setTimeout(work, 200)
}
