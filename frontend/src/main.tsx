import { ThemeProvider } from 'next-themes'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'

import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'

import App from '@/App'
import '@/index.css'

// A rebuild replaces every hashed chunk; a tab holding the previous shell reloads once to pick
// up the new one instead of failing on a chunk that no longer exists.
const CHUNK_RELOAD_FLAG = 'pjq.staleChunkReloaded'
window.addEventListener('vite:preloadError', (event) => {
    try {
        if (sessionStorage.getItem(CHUNK_RELOAD_FLAG) === '1') return
        sessionStorage.setItem(CHUNK_RELOAD_FLAG, '1')
    } catch {
        return
    }
    event.preventDefault()
    window.location.reload()
})

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
            <TooltipProvider delay={500}>
                <BrowserRouter>
                    <App />
                </BrowserRouter>
                <Toaster richColors />
            </TooltipProvider>
        </ThemeProvider>
    </StrictMode>,
)
