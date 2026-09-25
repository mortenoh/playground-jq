import { describe, expect, it } from 'vitest'

import { asFeatureCollection, boundsOf } from '@/lib/geo'

describe('boundsOf', () => {
    it('spans every coordinate pair', () => {
        const polygon = {
            type: 'Polygon',
            coordinates: [
                [
                    [-12, 8],
                    [-11, 9.5],
                    [-10.5, 7],
                    [-12, 8],
                ],
            ],
        }
        expect(boundsOf(polygon)).toEqual([
            [-12, 7],
            [-10.5, 9.5],
        ])
    })

    it('has no bounds without coordinates', () => {
        expect(boundsOf({ type: 'FeatureCollection', features: [] })).toBeNull()
    })
})

describe('asFeatureCollection', () => {
    it('wraps a feature and a bare geometry', () => {
        const point = { type: 'Point', coordinates: [1, 2] }
        expect(asFeatureCollection(point)).toEqual({
            type: 'FeatureCollection',
            features: [{ type: 'Feature', geometry: point, properties: {} }],
        })
        const feature = { type: 'Feature', geometry: point, properties: { a: 1 } }
        expect(asFeatureCollection(feature)).toEqual({ type: 'FeatureCollection', features: [feature] })
    })
})
