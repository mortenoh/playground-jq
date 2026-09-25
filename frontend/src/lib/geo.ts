/** Small GeoJSON helpers for the map preview. */

import type { JsonValue } from '@/lib/types'

export type Bounds = [[number, number], [number, number]]

/** The bounding box of every coordinate pair in a GeoJSON value, or null when it has none. */
export function boundsOf(value: JsonValue): Bounds | null {
    let west = Infinity
    let south = Infinity
    let east = -Infinity
    let north = -Infinity
    const visit = (node: JsonValue): void => {
        if (!Array.isArray(node)) {
            if (node !== null && typeof node === 'object')
                for (const child of Object.values(node)) visit(child)
            return
        }
        if (node.length >= 2 && typeof node[0] === 'number' && typeof node[1] === 'number') {
            west = Math.min(west, node[0])
            east = Math.max(east, node[0])
            south = Math.min(south, node[1])
            north = Math.max(north, node[1])
            return
        }
        for (const child of node) visit(child)
    }
    visit(value)
    if (!Number.isFinite(west)) return null
    return [
        [west, south],
        [east, north],
    ]
}

/** Any GeoJSON object as a FeatureCollection, which is what the map draws. */
export function asFeatureCollection(value: JsonValue): JsonValue {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return value
    if (value.type === 'FeatureCollection') return value
    if (value.type === 'Feature') return { type: 'FeatureCollection', features: [value] }
    return { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: value, properties: {} }] }
}
