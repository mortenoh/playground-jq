import { describe, expect, it } from 'vitest'

import { asFeatureCollection } from '@/lib/geo'

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
