import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useCallback, useEffect, useRef } from 'react'
import { Link, NavLink, useParams } from 'react-router'

import { LevelChip } from '@/components/Chips'
import { MarkdownWithSnippets } from '@/components/Markdown'
import { Loading, ProblemNote } from '@/components/PageState'
import { SnippetCard } from '@/components/SnippetCard'
import { useRead } from '@/hooks/use-read'
import { getChapter, guideToc } from '@/lib/client'
import { cn } from '@/lib/utils'

export default function GuidePage() {
    const { slug } = useParams()
    const readToc = useCallback(() => guideToc(), [])
    const toc = useRead(readToc)
    const current = slug ?? toc.value?.[0]?.slug
    const readChapter = useCallback(
        () => (current === undefined ? Promise.resolve(null) : getChapter(current)),
        [current],
    )
    const chapter = useRead(readChapter)
    const scroller = useRef<HTMLDivElement | null>(null)

    useEffect(() => {
        scroller.current?.scrollTo({ top: 0 })
    }, [current])

    if (toc.problem !== null) return <ProblemNote problem={toc.problem} />
    if (toc.value === null) return <Loading what="the guide" />
    const chapters = toc.value
    const index = chapters.findIndex((entry) => entry.slug === current)
    const previous = index > 0 ? chapters[index - 1] : undefined
    const next = index >= 0 && index < chapters.length - 1 ? chapters[index + 1] : undefined

    return (
        <div className="flex h-full min-h-0">
            <nav
                className="hidden w-72 shrink-0 overflow-auto border-r bg-card px-2 py-4 md:block"
                aria-label="Guide chapters"
            >
                <p className="px-2 pb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    The jq language guide
                </p>
                <ol>
                    {chapters.map((entry) => (
                        <li key={entry.slug}>
                            <NavLink
                                to={`/guide/${entry.slug}`}
                                className={cn(
                                    'flex items-baseline gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground',
                                    entry.slug === current && 'bg-accent text-accent-foreground',
                                )}
                            >
                                <span className="w-5 shrink-0 text-right font-mono text-xs">
                                    {entry.number}
                                </span>
                                <span>{entry.title}</span>
                            </NavLink>
                        </li>
                    ))}
                </ol>
            </nav>
            <div ref={scroller} className="min-w-0 flex-1 overflow-auto">
                <article className="mx-auto max-w-3xl px-5 py-6">
                    {chapter.problem !== null && <ProblemNote problem={chapter.problem} />}
                    {chapter.value === null && chapter.problem === null && <Loading what="the chapter" />}
                    {chapter.value !== null && (
                        <>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span>Chapter {chapter.value.number}</span>
                                <LevelChip level={chapter.value.level} long />
                            </div>
                            <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                                {chapter.value.title}
                            </h1>
                            <p className="mt-1 text-sm text-muted-foreground">{chapter.value.summary}</p>
                            <MarkdownWithSnippets
                                text={chapter.value.markdown}
                                className="mt-4"
                                render={(id) => {
                                    const snippet = chapter.value?.snippets.find(
                                        (candidate) => candidate.id === id,
                                    )
                                    return snippet === undefined ? null : (
                                        <SnippetCard
                                            snippet={snippet}
                                            chapterTitle={chapter.value?.title ?? ''}
                                        />
                                    )
                                }}
                            />
                            <div className="mt-10 flex justify-between gap-4 border-t pt-4 text-sm">
                                {previous !== undefined ? (
                                    <Link
                                        to={`/guide/${previous.slug}`}
                                        className="inline-flex items-center gap-1 text-primary-ink"
                                    >
                                        <ChevronLeft className="size-4" aria-hidden /> {previous.title}
                                    </Link>
                                ) : (
                                    <span />
                                )}
                                {next !== undefined && (
                                    <Link
                                        to={`/guide/${next.slug}`}
                                        className="inline-flex items-center gap-1 text-primary-ink"
                                    >
                                        {next.title} <ChevronRight className="size-4" aria-hidden />
                                    </Link>
                                )}
                            </div>
                        </>
                    )}
                </article>
            </div>
        </div>
    )
}
