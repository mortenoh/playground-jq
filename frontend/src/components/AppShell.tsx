import { BookOpen, GraduationCap, Library, Moon, Search, Sun, SquareTerminal, TextSearch } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useEffect, type ReactNode } from 'react'
import { NavLink } from 'react-router'

import { CommandPalette, paletteOpen } from '@/components/CommandPalette'
import { warmEditor } from '@/components/editor/CodePane'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { cn } from '@/lib/utils'

const NAV = [
    { to: '/', label: 'Playground', icon: SquareTerminal, end: true },
    { to: '/learn', label: 'Learn', icon: GraduationCap, end: false },
    { to: '/guide', label: 'Guide', icon: BookOpen, end: false },
    { to: '/examples', label: 'Examples', icon: Library, end: false },
    { to: '/reference', label: 'Reference', icon: TextSearch, end: false },
]

function ThemeToggle() {
    const { resolvedTheme, setTheme } = useTheme()
    const dark = resolvedTheme === 'dark'
    return (
        <Button
            variant="ghost"
            size="icon-sm"
            aria-label={dark ? 'Use the light theme' : 'Use the dark theme'}
            onClick={() => {
                setTheme(dark ? 'light' : 'dark')
            }}
        >
            {dark ? <Sun /> : <Moon />}
        </Button>
    )
}

export function AppShell({ children }: { children: ReactNode }) {
    useEffect(() => {
        warmEditor()
        const onKey = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
                event.preventDefault()
                paletteOpen.set(!paletteOpen.get())
            }
        }
        window.addEventListener('keydown', onKey)
        return () => {
            window.removeEventListener('keydown', onKey)
        }
    }, [])

    return (
        <div className="flex h-full flex-col">
            <header className="flex h-shell-top shrink-0 items-center gap-2 border-b bg-card px-3">
                <NavLink to="/" className="mr-2 flex items-center gap-2 font-semibold">
                    <span className="flex size-6 items-center justify-center rounded-md bg-primary font-mono text-xs font-bold text-primary-foreground">
                        jq
                    </span>
                    <span className="hidden text-sm sm:inline">playground</span>
                </NavLink>
                <nav className="flex items-center gap-0.5 overflow-x-auto" aria-label="Main">
                    {NAV.map(({ to, label, icon: Icon, end }) => (
                        <NavLink
                            key={to}
                            to={to}
                            end={end}
                            className={({ isActive }) =>
                                cn(
                                    'flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground',
                                    isActive && 'bg-accent text-accent-foreground hover:bg-accent',
                                )
                            }
                        >
                            <Icon className="size-4" aria-hidden />
                            <span className="hidden md:inline">{label}</span>
                        </NavLink>
                    ))}
                </nav>
                <div className="ml-auto flex items-center gap-1">
                    <Button
                        variant="outline"
                        size="sm"
                        className="gap-2 text-muted-foreground"
                        onClick={() => {
                            paletteOpen.set(true)
                        }}
                    >
                        <Search />
                        <span className="hidden lg:inline">Search examples, builtins, chapters</span>
                        <Kbd>⌘K</Kbd>
                    </Button>
                    <ThemeToggle />
                </div>
            </header>
            <main className="min-h-0 flex-1">{children}</main>
            <CommandPalette />
        </div>
    )
}
