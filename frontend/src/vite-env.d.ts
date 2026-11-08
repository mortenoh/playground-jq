/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_PJQ_STATIC?: string
}

/** The app's version, from package.json at build time. */
declare const __APP_VERSION__: string
