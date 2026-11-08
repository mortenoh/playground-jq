import { useMemo, useState } from 'react'

import { GeoJsonLayer } from '@winterop-com/sokkel-ui-maps/GeoJsonLayer'
import { MapPopup } from '@winterop-com/sokkel-ui-maps/MapPopup'
import { MapView as Map } from '@winterop-com/sokkel-ui-maps/MapView'
import type { Feature, FeatureCollection } from 'geojson'

import { asFeatureCollection } from '@/lib/geo'
import type { JsonValue } from '@/lib/types'

/**
 * A GeoJSON output on sokkel-ui-maps: polygons filled, lines drawn, points as circles, in the
 * theme's colours over a basemap that follows the scheme, fitted to the data. Choosing a feature
 * shows its properties. Loaded lazily in its own chunk.
 */

/** How many properties a popup lists before it stops. */
const ROWS = 12

/** The output as a collection whose every feature has an id, so any feature can be chosen. */
function identified(value: JsonValue): FeatureCollection {
    const collection = asFeatureCollection(value) as unknown as FeatureCollection
    return {
        ...collection,
        features: collection.features.map((feature, index) =>
            feature.id === undefined || feature.id === null
                ? Object.assign({}, feature, { id: `f${String(index)}` })
                : feature,
        ),
    }
}

function text(item: unknown): string {
    return typeof item === 'string' ? item : JSON.stringify(item)
}

export default function MapView({ value }: { value: JsonValue }) {
    const data = useMemo(() => identified(value), [value])
    const [chosen, setChosen] = useState<Feature | null>(null)

    return (
        <div className="h-full min-h-64 w-full" data-testid="map">
            <Map
                label="The output on a map"
                maxFitZoom={12}
                onSelectedChange={(_id, feature) => {
                    setChosen(feature)
                }}
                className="h-full"
            >
                <GeoJsonLayer id="output" data={data} color="var(--primary)" />
                {chosen !== null && (
                    <MapPopup
                        feature={chosen}
                        title={text(chosen.properties?.name ?? chosen.id ?? 'Feature')}
                        rows={Object.entries(chosen.properties ?? {})
                            .slice(0, ROWS)
                            .map(([label, item]) => ({ label, value: text(item) }))}
                        onClose={() => {
                            setChosen(null)
                        }}
                    />
                )}
            </Map>
        </div>
    )
}
