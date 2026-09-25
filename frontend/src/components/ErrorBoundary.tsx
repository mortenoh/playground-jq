import { Component, type ErrorInfo, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'

/**
 * Catches a page that failed to render or load (a lazy chunk that could not be fetched, most
 * often after a deploy) and offers a reload, instead of leaving a loading message forever.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
    override state: { error: Error | null } = { error: null }

    static getDerivedStateFromError(error: Error): { error: Error } {
        return { error }
    }

    override componentDidCatch(error: Error, info: ErrorInfo): void {
        console.error('page failed', error, info.componentStack)
    }

    override render(): ReactNode {
        if (this.state.error === null) return this.props.children
        return (
            <div className="m-6 max-w-xl rounded-md border border-critical/40 bg-critical/10 p-4 text-sm">
                <p className="font-medium">This page could not be loaded.</p>
                <p className="mt-1 text-muted-foreground">{this.state.error.message}</p>
                <Button className="mt-3" size="sm" onClick={() => window.location.reload()}>
                    Reload
                </Button>
            </div>
        )
    }
}
