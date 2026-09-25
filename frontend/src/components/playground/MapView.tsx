import 'maplibre-gl/dist/maplibre-gl.css'

import * as maplibregl from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { useEffect, useRef } from 'react'

import { asFeatureCollection, boundsOf } from '@/lib/geo'
import type { JsonValue } from '@/lib/types'

/**
 * A GeoJSON output on a map: polygons filled, lines drawn, points as circles, properties in a
 * popup on click. OpenStreetMap raster tiles; loaded lazily in its own chunk.
 */

// The worker is bundled by vite as its own entry; maplibre is told where it landed.
maplibregl.setWorkerUrl(workerUrl)

const STYLE: maplibregl.StyleSpecification = {
    version: 8,
    sources: {
        osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '&copy; OpenStreetMap contributors',
            maxzoom: 19,
        },
    },
    layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
}

const AMBER = '#c28a17'

function escapeHtml(text: string): string {
    return text.replace(/[&<>"']/g, (char) => `&#${String(char.charCodeAt(0))};`)
}

export default function MapView({ value }: { value: JsonValue }) {
    const host = useRef<HTMLDivElement | null>(null)

    useEffect(() => {
        if (host.current === null) return
        const map = new maplibregl.Map({ container: host.current, style: STYLE, center: [0, 0], zoom: 1 })
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
        map.on('load', () => {
            map.addSource('output', { type: 'geojson', data: asFeatureCollection(value) as never })
            map.addLayer({
                id: 'fill',
                type: 'fill',
                source: 'output',
                filter: ['==', ['geometry-type'], 'Polygon'],
                paint: { 'fill-color': AMBER, 'fill-opacity': 0.25 },
            })
            map.addLayer({
                id: 'line',
                type: 'line',
                source: 'output',
                filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'LineString']]],
                paint: { 'line-color': AMBER, 'line-width': 1.5 },
            })
            map.addLayer({
                id: 'point',
                type: 'circle',
                source: 'output',
                filter: ['==', ['geometry-type'], 'Point'],
                paint: {
                    'circle-color': AMBER,
                    'circle-radius': 4,
                    'circle-stroke-color': '#ffffff',
                    'circle-stroke-width': 1,
                },
            })
            for (const layer of ['fill', 'point', 'line']) {
                map.on('click', layer, (event) => {
                    const feature = event.features?.[0]
                    if (feature === undefined) return
                    const rows = Object.entries(feature.properties)
                        .slice(0, 12)
                        .map(
                            ([key, item]) =>
                                `<tr><th style="text-align:left;padding-right:8px">${escapeHtml(key)}</th><td>${escapeHtml(String(item))}</td></tr>`,
                        )
                        .join('')
                    new maplibregl.Popup({ maxWidth: '320px' })
                        .setLngLat(event.lngLat)
                        .setHTML(
                            `<table style="font:12px var(--font-mono);color:#222">${rows || '<tr><td>no properties</td></tr>'}</table>`,
                        )
                        .addTo(map)
                })
                map.on('mouseenter', layer, () => {
                    map.getCanvas().style.cursor = 'pointer'
                })
                map.on('mouseleave', layer, () => {
                    map.getCanvas().style.cursor = ''
                })
            }
            const bounds = boundsOf(value)
            if (bounds !== null) map.fitBounds(bounds, { padding: 30, maxZoom: 12, duration: 0 })
        })
        return () => {
            map.remove()
        }
    }, [value])

    return <div ref={host} className="h-full min-h-64 w-full" data-testid="map" />
}
