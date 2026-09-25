import { BookOpen, FunctionSquare, GraduationCap, Library } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'

import {
    Command,
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command'
import { useStore } from '@/hooks/use-store'
import { builtins } from '@/lib/builtins'
import { guideToc, listExamples, listTutorials } from '@/lib/client'
import { createStore } from '@/lib/store'
import type { Builtin, ChapterSummary, ExampleGroup, TutorialSummary } from '@/lib/types'

export const paletteOpen = createStore(false)

interface Entry {
    id: string
    title: string
    detail: string
    to: string
}

interface Catalogue {
    examples: ExampleGroup[]
    tutorials: TutorialSummary[]
    chapters: ChapterSummary[]
    builtins: Builtin[]
}

const LIMIT = 40

function matches(entry: Entry, words: string[]): boolean {
    const haystack = `${entry.title} ${entry.detail}`.toLowerCase()
    return words.every((word) => haystack.includes(word))
}

export function CommandPalette() {
    const open = useStore(paletteOpen)
    const [query, setQuery] = useState('')
    const [catalogue, setCatalogue] = useState<Catalogue | null>(null)
    const navigate = useNavigate()

    useEffect(() => {
        if (!open || catalogue !== null) return
        void Promise.all([listExamples(), listTutorials(), guideToc(), builtins()]).then(
            ([examples, tutorials, chapters, loaded]) => {
                setCatalogue({ examples, tutorials, chapters, builtins: loaded })
            },
        )
    }, [open, catalogue])

    const sections = useMemo(() => {
        if (catalogue === null) return []
        const words = query.toLowerCase().split(/\s+/).filter(Boolean)
        const pick = (entries: Entry[]) => entries.filter((entry) => matches(entry, words)).slice(0, LIMIT)
        return [
            {
                label: 'Tutorials',
                icon: GraduationCap,
                entries: pick(
                    catalogue.tutorials.map((tutorial) => ({
                        id: `t:${tutorial.id}`,
                        title: tutorial.title,
                        detail: `jq ${String(tutorial.level)} - ${tutorial.summary}`,
                        to: `/learn/${tutorial.id}/1`,
                    })),
                ),
            },
            {
                label: 'Guide',
                icon: BookOpen,
                entries: pick(
                    catalogue.chapters.map((chapter) => ({
                        id: `g:${chapter.slug}`,
                        title: `${String(chapter.number)}. ${chapter.title}`,
                        detail: chapter.summary,
                        to: `/guide/${chapter.slug}`,
                    })),
                ),
            },
            {
                label: 'Builtins',
                icon: FunctionSquare,
                entries: pick(
                    catalogue.builtins.map((builtin) => ({
                        id: `b:${builtin.name}`,
                        title: builtin.signatures.join(', '),
                        detail: builtin.summary,
                        to: `/reference?q=${encodeURIComponent(builtin.name)}`,
                    })),
                ),
            },
            {
                label: 'Examples',
                icon: Library,
                entries: pick(
                    catalogue.examples.flatMap((group) =>
                        group.examples.map((example) => ({
                            id: `e:${example.id}`,
                            title: example.title,
                            detail: `${group.title} ${example.program} ${example.tags.join(' ')}`,
                            to: `/examples/${example.id}`,
                        })),
                    ),
                ),
            },
        ].filter((section) => section.entries.length > 0)
    }, [catalogue, query])

    function close(): void {
        paletteOpen.set(false)
        setQuery('')
    }

    return (
        <CommandDialog
            open={open}
            onOpenChange={(next) => {
                if (!next) close()
                else paletteOpen.set(true)
            }}
            title="Search"
            description="Tutorials, guide chapters, builtins and examples"
            className="top-[12vh] w-full p-0 shadow-2xl sm:max-w-[720px]"
        >
            <Command shouldFilter={false} label="Search" className="p-0">
                <CommandInput
                    placeholder="Search tutorials, chapters, builtins, examples"
                    value={query}
                    onValueChange={setQuery}
                    autoFocus
                />
                <CommandList className="max-h-[28rem] p-2">
                    <CommandEmpty>{catalogue === null ? 'Loading.' : 'Nothing matches that.'}</CommandEmpty>
                    {sections.map(({ label, icon: Icon, entries }) => (
                        <CommandGroup key={label} heading={label}>
                            {entries.map((entry) => (
                                <CommandItem
                                    key={entry.id}
                                    value={entry.id}
                                    onSelect={() => {
                                        close()
                                        void navigate(entry.to)
                                    }}
                                    className="gap-3"
                                >
                                    <Icon className="size-4 text-muted-foreground" aria-hidden />
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate font-mono text-sm">
                                            {entry.title}
                                        </span>
                                        <span className="block truncate text-xs text-muted-foreground">
                                            {entry.detail}
                                        </span>
                                    </span>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    ))}
                </CommandList>
            </Command>
        </CommandDialog>
    )
}
