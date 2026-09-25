import { Download, Radio, SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { NativeSelect } from '@/components/NativeSelect'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { ApiError } from '@/lib/api'
import { fetchSource } from '@/lib/client'
import type { InputOrigin } from '@/lib/playground'
import type { Fetched, JsonValue, SourceInfo, SourceKind } from '@/lib/types'

/** Parse `a=1&b=2&b=3` into a query object, repeated keys becoming arrays. */
export function parseQuery(text: string): Record<string, string | string[]> {
    const query: Record<string, string | string[]> = {}
    for (const [key, value] of new URLSearchParams(text.replace(/^\?/, ''))) {
        const held = query[key]
        query[key] = held === undefined ? value : Array.isArray(held) ? [...held, value] : [held, value]
    }
    return query
}

function CustomRequest({
    source,
    open,
    onOpenChange,
    onFetched,
}: {
    source: SourceInfo
    open: boolean
    onOpenChange: (open: boolean) => void
    onFetched: (fetched: Fetched, title: string) => void
}) {
    const isEcho = source.id === 'echo'
    const [method, setMethod] = useState('GET')
    const [path, setPath] = useState(isEcho ? '/get' : '/api/organisationUnits')
    const [query, setQuery] = useState(isEcho ? 'hello=world&n=1' : 'fields=id,name,level&pageSize=5')
    const [body, setBody] = useState('{\n  "hello": "jq"\n}')
    const [busy, setBusy] = useState(false)

    async function submit(): Promise<void> {
        const request: Record<string, JsonValue> = isEcho
            ? { method, path, query: parseQuery(query) }
            : { path, params: parseQuery(query) }
        if (isEcho && method !== 'GET' && body.trim() !== '') {
            try {
                request.json_body = JSON.parse(body) as JsonValue
            } catch {
                toast.error('The body is not valid JSON')
                return
            }
        }
        setBusy(true)
        try {
            const fetched = await fetchSource(source.id, { request, mode: 'live' })
            onFetched(fetched, `${isEcho ? method : 'GET'} ${path}`)
            onOpenChange(false)
        } catch (error) {
            toast.error(error instanceof ApiError ? error.problem.detail : String(error))
        } finally {
            setBusy(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Custom {source.title} request</DialogTitle>
                    <DialogDescription>
                        {isEcho
                            ? 'Send any request to postman-echo; the response describing it becomes the input.'
                            : 'GET any Web API path from DHIS2; the JSON response becomes the input.'}
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-3 text-sm">
                    <div className="flex gap-2">
                        {isEcho && (
                            <NativeSelect
                                aria-label="Method"
                                value={method}
                                onChange={(event) => {
                                    setMethod(event.target.value)
                                    if (
                                        path === '/get' ||
                                        path === '/post' ||
                                        path === '/put' ||
                                        path === '/patch' ||
                                        path === '/delete'
                                    ) {
                                        setPath(`/${event.target.value.toLowerCase()}`)
                                    }
                                }}
                            >
                                {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((name) => (
                                    <option key={name}>{name}</option>
                                ))}
                            </NativeSelect>
                        )}
                        <Input
                            aria-label="Path"
                            value={path}
                            onChange={(event) => setPath(event.target.value)}
                            className="font-mono"
                        />
                    </div>
                    <label className="grid gap-1">
                        <span className="text-xs text-muted-foreground">Query parameters</span>
                        <Input
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            className="font-mono"
                        />
                    </label>
                    {isEcho && method !== 'GET' && (
                        <label className="grid gap-1">
                            <span className="text-xs text-muted-foreground">JSON body</span>
                            <Textarea
                                value={body}
                                onChange={(event) => setBody(event.target.value)}
                                className="min-h-28 font-mono"
                            />
                        </label>
                    )}
                </div>
                <DialogFooter>
                    <Button onClick={() => void submit()} disabled={busy}>
                        {busy ? 'Sending' : 'Send'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

/** Choose an input: a static dataset, a postman-echo request or a DHIS2 endpoint, live or recorded. */
export function SourcePicker({
    sources,
    origin,
    onLoaded,
}: {
    sources: SourceInfo[]
    origin: InputOrigin | null
    onLoaded: (text: string, origin: InputOrigin) => void
}) {
    const [chosen, setChosen] = useState(origin?.ref ?? '')
    const [live, setLive] = useState(false)
    const [busy, setBusy] = useState(false)
    const [custom, setCustom] = useState<SourceInfo | null>(null)

    const [sourceId, presetId] = chosen.split(':') as [SourceKind | '', string | undefined]
    const source = sources.find((candidate) => candidate.id === sourceId)
    const preset = source?.presets.find((candidate) => candidate.id === presetId)
    const liveCapable = source?.live === true

    async function load(ref: string, useLive: boolean): Promise<void> {
        const [id, pid] = ref.split(':') as [SourceKind, string]
        const info = sources.find((candidate) => candidate.id === id)
        const title = info?.presets.find((candidate) => candidate.id === pid)?.title ?? ref
        setBusy(true)
        try {
            const fetched = await fetchSource(id, {
                preset: pid,
                mode: useLive && info?.live === true ? 'live' : 'snapshot',
            })
            onLoaded(fetched.text, { ref, title, live: !fetched.snapshot })
            toast.success(`Loaded ${title}`, {
                description: `${(fetched.bytes / 1024).toFixed(1)} KB ${fetched.snapshot ? 'from the recorded snapshot' : fetched.cached ? 'live (cached)' : 'live'}`,
            })
        } catch (error) {
            toast.error(error instanceof ApiError ? error.problem.detail : String(error))
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="flex flex-wrap items-center gap-2">
            <NativeSelect
                aria-label="Input source"
                value={chosen}
                className="max-w-72 min-w-0 flex-1"
                onChange={(event) => {
                    setChosen(event.target.value)
                    if (event.target.value !== '') void load(event.target.value, live)
                }}
            >
                <option value="">Choose an input</option>
                {sources.map((info) => (
                    <optgroup key={info.id} label={info.title}>
                        {info.presets.map((item) => (
                            <option key={item.id} value={`${info.id}:${item.id}`}>
                                {item.title}
                            </option>
                        ))}
                    </optgroup>
                ))}
            </NativeSelect>
            {liveCapable && (
                <label
                    className="flex items-center gap-1.5 text-xs text-muted-foreground"
                    title="Fetch from the live service instead of the recorded snapshot"
                >
                    <Switch
                        checked={live}
                        disabled={source?.available === false}
                        onCheckedChange={(checked) => {
                            setLive(checked)
                            if (chosen !== '') void load(chosen, checked)
                        }}
                        aria-label="Fetch live"
                    />
                    <Radio className="size-3.5" aria-hidden /> live
                </label>
            )}
            {chosen !== '' && (
                <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Reload the input"
                    disabled={busy}
                    onClick={() => void load(chosen, live)}
                >
                    <Download />
                </Button>
            )}
            {sources
                .filter((info) => info.live)
                .map((info) => (
                    <Button
                        key={info.id}
                        variant="ghost"
                        size="sm"
                        onClick={() => setCustom(info)}
                        disabled={!info.available}
                    >
                        <SlidersHorizontal /> {info.id === 'echo' ? 'echo request' : 'DHIS2 request'}
                    </Button>
                ))}
            {preset !== undefined && (
                <p className="w-full truncate text-xs text-muted-foreground">{preset.description}</p>
            )}
            {custom !== null && (
                <CustomRequest
                    source={custom}
                    open
                    onOpenChange={(open) => {
                        if (!open) setCustom(null)
                    }}
                    onFetched={(fetched, title) => {
                        onLoaded(fetched.text, { ref: `${fetched.source}:custom`, title, live: true })
                        setChosen('')
                    }}
                />
            )}
        </div>
    )
}
