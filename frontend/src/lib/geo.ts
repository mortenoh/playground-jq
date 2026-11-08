/** Small GeoJSON helpers for the map preview. */

import type { JsonValue } from '@/lib/types'

/** Any GeoJSON object as a FeatureCollection, which is what the map draws. */
export function asFeatureCollection(value: JsonValue): JsonValue {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return value
    if (value.type === 'FeatureCollection') return value
    if (value.type === 'Feature') return { type: 'FeatureCollection', features: [value] }
    return { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: value, properties: {} }] }
}
