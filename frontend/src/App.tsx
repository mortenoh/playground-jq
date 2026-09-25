import { Suspense, lazy } from 'react'
import { Route, Routes } from 'react-router'

import { AppShell } from '@/components/AppShell'
import { Loading } from '@/components/PageState'

const PlaygroundPage = lazy(() => import('@/pages/PlaygroundPage'))
const ExamplesPage = lazy(() => import('@/pages/ExamplesPage'))
const ExamplePage = lazy(() => import('@/pages/ExamplePage'))
const GuidePage = lazy(() => import('@/pages/GuidePage'))
const LearnPage = lazy(() => import('@/pages/LearnPage'))
const TutorialPage = lazy(() => import('@/pages/TutorialPage'))
const ReferencePage = lazy(() => import('@/pages/ReferencePage'))

export default function App() {
    return (
        <AppShell>
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
                        element={<p className="p-6 text-sm text-muted-foreground">There is no page here.</p>}
                    />
                </Routes>
            </Suspense>
        </AppShell>
    )
}
