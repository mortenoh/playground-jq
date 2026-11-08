import { BookOpen, GraduationCap, Library, SquareTerminal, TextSearch } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router'

import { AccountMenu } from '@winterop-com/sokkel-ui/AccountMenu'
import { useAppearance } from '@winterop-com/sokkel-ui/hooks/use-appearance'
import { CORNERS, THEMES, TYPEFACES } from '@winterop-com/sokkel-ui/lib/appearance'
import { appearanceCommands, placeCommands } from '@winterop-com/sokkel-ui/lib/commands'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@winterop-com/sokkel-ui/primitives/dialog'
import { Rail, type RailGroup } from '@winterop-com/sokkel-ui/Rail'
import { SchemeToggle } from '@winterop-com/sokkel-ui/SchemeToggle'
import { Shell } from '@winterop-com/sokkel-ui/Shell'
import { StatusItem, StatusLine } from '@winterop-com/sokkel-ui/StatusLine'
import { ThemePicker } from '@winterop-com/sokkel-ui/ThemePicker'
import { TopBar } from '@winterop-com/sokkel-ui/TopBar'

import { APPEARANCE_DEFAULTS } from '@/appearance'
import { warmEditor } from '@/components/editor/CodePane'
import { STATIC } from '@/lib/runtime'
import { contentSearch, type ContentResult } from '@/lib/search'

const PLACES: RailGroup[] = [
    {
        id: 'work',
        entries: [
            { id: 'playground', label: 'Playground', icon: SquareTerminal, href: '/' },
            { id: 'learn', label: 'Learn', icon: GraduationCap, href: '/learn' },
            { id: 'guide', label: 'Guide', icon: BookOpen, href: '/guide' },
            { id: 'examples', label: 'Examples', icon: Library, href: '/examples' },
            { id: 'reference', label: 'Reference', icon: TextSearch, href: '/reference' },
        ],
    },
]

/** The pages laid out in panes of their own (the playground, a tutorial step), where the rail narrows to its icons. */
const WORK_PAGE = /^\/(learn\/[^/]+\/[^/]+)?$/

/** The place a path belongs to: the playground only at the root, every other by its first segment. */
function placeOf(path: string): string {
    if (path === '/') return 'playground'
    return path.split('/')[1] ?? ''
}

function Mark() {
    return (
        <span className="flex size-6 items-center justify-center rounded-md bg-primary font-mono text-xs font-bold text-primary-foreground">
            jq
        </span>
    )
}

/**
 * The frame every page stands in: sokkel-ui's shell, with the places in the rail, the command
 * palette on Cmd+K (places, appearance, and a search over tutorials, chapters, builtins and
 * examples), and the runtime and version in the foot. The playground and a tutorial step narrow
 * the rail to its icons, so their panes keep the width.
 */
export function AppShell({ children }: { children: ReactNode }) {
    const { settings, setSettings } = useAppearance(APPEARANCE_DEFAULTS)
    const [appearanceOpen, setAppearanceOpen] = useState(false)
    const navigate = useNavigate()
    const { pathname } = useLocation()
    const place = placeOf(pathname)

    useEffect(() => {
        warmEditor()
    }, [])

    const groups = useMemo(
        () =>
            PLACES.map((group) => ({
                ...group,
                entries: group.entries.map((entry) => ({ ...entry, active: entry.id === place })),
            })),
        [place],
    )

    const palette = useMemo(
        () => [
            ...placeCommands(PLACES, (href) => {
                void navigate(href)
            }),
            ...appearanceCommands(settings, setSettings, { themes: THEMES }),
        ],
        [navigate, settings, setSettings],
    )

    const title = PLACES[0].entries.find((entry) => entry.id === place)?.label

    return (
        <Shell
            route={pathname}
            railMode={WORK_PAGE.test(pathname) ? 'collapsed' : undefined}
            palette={palette}
            paletteFilter="terms"
            paletteSearch={{
                search: contentSearch,
                onOpen: (result) => {
                    void navigate((result as ContentResult).to)
                },
            }}
            paletteWords={{ placeholder: 'Search tutorials, chapters, builtins, examples' }}
            rail={
                <Rail
                    mark={<Mark />}
                    name="jq playground"
                    markHref="/"
                    groups={groups}
                    renderLink={(entry, inner, className) => (
                        <NavLink to={entry.href ?? '/'} end={entry.href === '/'} className={className}>
                            {inner}
                        </NavLink>
                    )}
                    foot={
                        <AccountMenu
                            name="Local"
                            local
                            scheme={settings.scheme}
                            onSchemeChange={(scheme) => {
                                setSettings({ ...settings, scheme })
                            }}
                            onAppearance={() => {
                                setAppearanceOpen(true)
                            }}
                        />
                    }
                />
            }
            top={
                <TopBar
                    trail={title === undefined ? [] : [{ label: title }]}
                    actions={<SchemeToggle fallback={settings.scheme} />}
                />
            }
            foot={
                <StatusLine
                    note={
                        STATIC
                            ? 'jq 1.8 in your browser over recorded inputs; run it locally for live DHIS2 and postman-echo'
                            : 'jq on the server, with live DHIS2 and postman-echo'
                    }
                >
                    <StatusItem label="jq">1.8</StatusItem>
                    <StatusItem code>{__APP_VERSION__}</StatusItem>
                </StatusLine>
            }
        >
            {children}
            <Dialog open={appearanceOpen} onOpenChange={setAppearanceOpen}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Appearance</DialogTitle>
                    </DialogHeader>
                    <ThemePicker
                        value={settings}
                        onChange={setSettings}
                        themes={THEMES}
                        corners={CORNERS}
                        typefaces={TYPEFACES}
                        system
                    />
                </DialogContent>
            </Dialog>
        </Shell>
    )
}
