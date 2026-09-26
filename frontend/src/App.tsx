import { Suspense, lazy } from 'react'
import { Route, Routes } from 'react-router'

import { AppShell } from '@/components/AppShell'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { Loading } from '@/components/PageState'
import { whenIdle } from '@/lib/idle'

const pages = {
    playground: () => import('@/pages/PlaygroundPage'),
    examples: () => import('@/pages/ExamplesPage'),
    example: () => import('@/pages/ExamplePage'),
    guide: () => import('@/pages/GuidePage'),
    learn: () => import('@/pages/LearnPage'),
    tutorial: () => import('@/pages/TutorialPage'),
    reference: () => import('@/pages/ReferencePage'),
}

const PlaygroundPage = lazy(pages.playground)
const ExamplesPage = lazy(pages.examples)
const ExamplePage = lazy(pages.example)
const GuidePage = lazy(pages.guide)
const LearnPage = lazy(pages.learn)
const TutorialPage = lazy(pages.tutorial)
const ReferencePage = lazy(pages.reference)

// Every page's chunk is fetched once the browser is idle, so the first visit to a tab does not
// wait for the network (this matters most on the static site).
whenIdle(() => {
    for (const load of Object.values(pages)) void load().catch(() => undefined)
})

export default function App() {
    return (
        <AppShell>
            <ErrorBoundary>
                <Suspense fallback={<Loading what="the page" />}>
                    <Routes>
                        <Route path="/" element={<PlaygroundPage />} />
                        <Route path="/examples" element={<ExamplesPage />} />
                        <Route path="/examples/:id" element={<ExamplePage />} />
                        <Route path="/guide" element={<GuidePage />} />
                        <Route path="/guide/:slug" element={<GuidePage />} />
                        <Route path="/learn" element={<LearnPage />} />
                        <Route path="/learn/:id/:step" element={<TutorialPage />} />
                        <Route path="/reference" element={<ReferencePage />} />
                        <Route
                            path="*"
                            element={
                                <p className="p-6 text-sm text-muted-foreground">There is no page here.</p>
                            }
                        />
                    </Routes>
                </Suspense>
            </ErrorBoundary>
        </AppShell>
    )
}
