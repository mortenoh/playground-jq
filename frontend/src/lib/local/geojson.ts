/**
 * GeoJSON validation for the in-browser engine: the structural rules of RFC 7946 that
 * geojson-pydantic enforces on the server (types, position arrays, ring closure and length).
 */

import type { JsonValue } from '@/lib/types'

type Json = JsonValue

function isObject(value: Json): value is { [key: string]: Json } {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isPosition(value: Json): boolean {
    return Array.isArray(value) && value.length >= 2 && value.every((part) => typeof part === 'number')
}

function isPositions(value: Json, minimum: number): boolean {
    return Array.isArray(value) && value.length >= minimum && value.every(isPosition)
}

function isRing(value: Json): boolean {
    if (!isPositions(value, 4) || !Array.isArray(value)) return false
    return JSON.stringify(value[0]) === JSON.stringify(value[value.length - 1])
}

function isPolygonCoordinates(value: Json): boolean {
    return Array.isArray(value) && value.every(isRing)
}

function isGeometry(value: Json): boolean {
    if (!isObject(value)) return false
    const coordinates = value.coordinates
    switch (value.type) {
        case 'Point':
            return isPosition(coordinates)
        case 'MultiPoint':
            return isPositions(coordinates, 0)
        case 'LineString':
            return isPositions(coordinates, 2)
        case 'MultiLineString':
            return Array.isArray(coordinates) && coordinates.every((line) => isPositions(line, 2))
        case 'Polygon':
            return isPolygonCoordinates(coordinates)
        case 'MultiPolygon':
            return Array.isArray(coordinates) && coordinates.every(isPolygonCoordinates)
        case 'GeometryCollection':
            return Array.isArray(value.geometries) && value.geometries.every(isGeometry)
        default:
            return false
    }
}

function isFeature(value: Json): boolean {
    if (!isObject(value) || value.type !== 'Feature') return false
    if (!('geometry' in value) || !('properties' in value)) return false
    const properties = value.properties
    return (
        (value.geometry === null || isGeometry(value.geometry)) &&
        (properties === null || isObject(properties))
    )
}

/** Whether a value is a valid GeoJSON object. */
export function isGeoJson(value: Json): boolean {
    if (!isObject(value)) return false
    if (value.type === 'FeatureCollection')
        return Array.isArray(value.features) && value.features.every(isFeature)
    if (value.type === 'Feature') return isFeature(value)
    return isGeometry(value)
}
