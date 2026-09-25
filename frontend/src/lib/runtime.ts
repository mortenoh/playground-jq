/**
 * Which runtime the app is built for.
 *
 * The backend build talks to the FastAPI server: jq runs server side, and live DHIS2 and
 * postman-echo are available. The static build (GitHub Pages) has no server: jq runs in the
 * browser as WebAssembly, and content and inputs are JSON files exported at build time.
 */

export const STATIC = import.meta.env.VITE_PJQ_STATIC === '1'

/** A file the static build carries, under the app's base path. */
export function staticUrl(path: string): string {
    return `${import.meta.env.BASE_URL}static-api/${path}`
}
