---
title: GeoJSON with jq
summary: Filtering, measuring and reshaping GeoJSON FeatureCollections, and turning DHIS2's geoFeatures format into standard GeoJSON.
level: 301
---

GeoJSON is plain JSON with a fixed shape, which makes jq a very capable tool for it. You can
filter features by their properties, count geometry types, compute bounding boxes and
centroids, slim down properties before handing a file to a web map, and convert other
formats into GeoJSON. Snippets in this chapter whose output is a GeoJSON document are
validated as GeoJSON, and the playground shows them on a map.

The data comes from the Sierra Leone DHIS2 demo: districts (level 2, polygons), chiefdoms
(level 3, polygons and multipolygons) and health facilities (level 4, points), plus the
`static:world-cities` dataset with sixteen city points.

## The structure

A GeoJSON file ([RFC 7946](https://www.rfc-editor.org/rfc/rfc7946)) is usually a
`FeatureCollection`: an object with `"type": "FeatureCollection"` and a `features` array. Each
feature has a `geometry` (with its own `type` and `coordinates`) and a free-form `properties`
object. An `id` is optional.

```jq-try
program: '{type, features: (.features | length), first: (.features[0] | {type, id, geometry: .geometry.type, properties})}'
ref: dhis2:org-units-geojson-level-2
caption: Thirteen districts; the first one with its geometry type and all its properties.
expected: [{"type": "FeatureCollection", "features": 13, "first": {"type": "Feature", "id": "O6uvpzGd5pu", "geometry": "Polygon", "properties": {"code": "OU_264", "name": "Bo", "level": "2", "parent": "ImspTQPwCqd", "parentGraph": "ImspTQPwCqd", "groups": ["w1Atoz18PCL", "jqBqIXoXpfy"]}}}]
```

Coordinates are nested arrays whose depth depends on the geometry type. A position is always
`[longitude, latitude]`, in that order.

| Geometry | `coordinates` | Nesting |
| --- | --- | --- |
| `Point` | a position `[lon, lat]` | 1 |
| `LineString`, `MultiPoint` | array of positions | 2 |
| `Polygon` | array of rings, each an array of positions | 3 |
| `MultiPolygon` | array of polygons | 4 |

## Filtering features by properties

A filtered FeatureCollection is the original object with its `features` array replaced. The
update operator keeps everything else, such as a `crs` member, intact:

```jq-try
program: '.features |= map(select(.properties.country == "SL"))'
ref: static:world-cities
geojson: true
caption: Only the three cities in Sierra Leone, still a valid FeatureCollection.
expected: [{"type": "FeatureCollection", "features": [{"type": "Feature", "id": 3, "geometry": {"type": "Point", "coordinates": [-13.2317, 8.4657]}, "properties": {"name": "Freetown", "country": "SL", "population": 1055964, "capital": true}}, {"type": "Feature", "id": 4, "geometry": {"type": "Point", "coordinates": [-11.7383, 7.9644]}, "properties": {"name": "Bo", "country": "SL", "population": 174354, "capital": false}}, {"type": "Feature", "id": 5, "geometry": {"type": "Point", "coordinates": [-11.1903, 7.8767]}, "properties": {"name": "Kenema", "country": "SL", "population": 200354, "capital": false}}]}]
```

DHIS2 includes the ancestry of each org unit in `parentGraph`, so selecting every facility
inside a district is a string test:

```jq-try
program: '[.features[] | select(.properties.parentGraph | split("/") | index("O6uvpzGd5pu"))] | length'
ref: dhis2:org-units-geojson-level-4
caption: 54 of the 601 facilities lie in the Bo district (id O6uvpzGd5pu).
expected: [54]
```

Watch the types of property values. DHIS2 sends `level` as a string, so comparing it with a
number silently matches nothing:

```jq-try
program: '([.features[] | select(.properties.level == 4)] | length), ([.features[] | select(.properties.level == "4")] | length)'
ref: dhis2:org-units-geojson-level-4
caption: 'Common mistake: 4 is not "4". The first count is 0, the second 601.'
expected: [0, 601]
```

## Counting geometry types

```jq-try
program: '.features | group_by(.geometry.type) | map({key: .[0].geometry.type, value: length}) | from_entries'
ref: dhis2:org-units-geojson-level-3
caption: 136 chiefdoms are single polygons; 16 consist of several parts, such as islands.
expected: [{"MultiPolygon": 16, "Polygon": 136}]
```

## Extracting coordinates

For points, the coordinates are the position itself. Destructuring with `as [$lon, $lat]`
names the two numbers and avoids mixing them up:

```jq-try
program: '.features[] | select(.properties.capital and .properties.population > 5000000) | .geometry.coordinates as [$lon, $lat] | "\(.properties.name): lat \($lat), lon \($lon)"'
ref: static:world-cities
options: {raw_output: true}
caption: Capitals with more than five million people; latitude is the second number.
expected: ["Hanoi: lat 21.0278, lon 105.8342", "Dhaka: lat 23.8103, lon 90.4125", "Lima: lat -12.0464, lon -77.0428"]
```

For polygons, a small recursive function collects every position regardless of nesting
depth. A position is the first array whose first element is a number:

```jq-try
program: |
  def positions: if (.[0] | type) == "number" then . else .[] | positions end;
  .features[] | select(.properties.name == "Bo") | {name: .properties.name, geometry: .geometry.type, rings: (.geometry.coordinates | length), positions: ([.geometry.coordinates | positions] | length)}
ref: dhis2:org-units-geojson-level-2
caption: The Bo district outline is one ring of positions.
expected: [{"name": "Bo", "geometry": "Polygon", "rings": 1, "positions": 549}]
```

## Bounding boxes

A bounding box is `[min lon, min lat, max lon, max lat]`. With the positions of all features
in one array, `min` and `max` of each column give it directly:

```jq-try
program: '[.features[].geometry.coordinates] | [(map(.[0]) | min), (map(.[1]) | min), (map(.[0]) | max), (map(.[1]) | max)]'
ref: static:world-cities
caption: The cities span from Lima in the west to Hanoi in the east, and from Lusaka in the south to Bergen in the north.
expected: [[-77.0428, -15.3875, 105.8342, 60.3913]]
```

For large polygon collections, `reduce` computes the same thing in one pass without first
collecting every position into an array:

```jq-try
program: |
  def positions: if (.[0] | type) == "number" then . else .[] | positions end;
  reduce (.features[].geometry.coordinates | positions) as [$x, $y]
    ([infinite, infinite, -infinite, -infinite];
     [([.[0], $x] | min), ([.[1], $y] | min), ([.[2], $x] | max), ([.[3], $y] | max)])
ref: dhis2:org-units-geojson-level-2
caption: The bounding box of Sierra Leone, from all district boundaries.
expected: [[-13.3035, 6.9176, -10.2658, 10.0004]]
```

Per-feature boxes are useful for zooming a map to one area:

```jq-try
program: |
  def positions: if (.[0] | type) == "number" then . else .[] | positions end;
  def bbox: [positions] | [(map(.[0]) | min), (map(.[1]) | min), (map(.[0]) | max), (map(.[1]) | max)];
  [.features[] | {name: .properties.name, bbox: (.geometry.coordinates | bbox)}] | sort_by(.name) | .[0:3]
ref: dhis2:org-units-geojson-level-2
caption: Boxes for the first three districts by name.
expected: [[{"name": "Bo", "bbox": [-12.1483, 7.4835, -11.3418, 8.4875]}, {"name": "Bombali", "bbox": [-12.5917, 8.638, -11.754, 9.9417]}, {"name": "Bonthe", "bbox": [-13.0715, 7.1807, -11.8479, 7.807]}]]
```

## Centroids of points

The centroid of a set of points is the mean longitude and mean latitude. For facilities in one
district, that gives a reasonable centre to label or zoom to:

```jq-try
program: '[.features[] | select(.properties.parentGraph | split("/") | index("O6uvpzGd5pu")) | .geometry.coordinates] | {count: length, lon: (map(.[0]) | add / length * 10000 | round / 10000), lat: (map(.[1]) | add / length * 10000 | round / 10000)}'
ref: dhis2:org-units-geojson-level-4
caption: The mean position of the 54 facilities in Bo, rounded to four decimals.
expected: [{"count": 54, "lon": -11.7064, "lat": 7.9097}]
```

The mean of polygon vertices is not the true area centroid (vertices are denser where the
border is wiggly), but it is often good enough for placing a label.

## Distances

jq has the trigonometric functions needed for the haversine formula. With a helper for
degrees to radians (`1 | atan` is pi / 4), distances between points are a few lines:

```jq-try
program: |
  def rad: . * (1 | atan) / 45;
  def km($a; $b):
    (($b[1] - $a[1]) | rad) as $dlat | (($b[0] - $a[0]) | rad) as $dlon
    | (($dlat / 2 | sin | . * .) + ($a[1] | rad | cos) * ($b[1] | rad | cos) * ($dlon / 2 | sin | . * .))
    | sqrt | asin * 2 * 6371 | round;
  (.features[] | select(.properties.name == "Freetown") | .geometry.coordinates) as $from
  | [.features[] | {name: .properties.name, km: km($from; .geometry.coordinates)}] | sort_by(.km) | .[1:4]
ref: static:world-cities
caption: The three cities nearest to Freetown, in kilometres along the Earth's surface.
expected: [[{"name": "Bo", "km": 174}, {"name": "Kenema", "km": 234}, {"name": "Accra", "km": 1474}]]
```

## From DHIS2 geoFeatures to GeoJSON

Besides the `.geojson` endpoint, DHIS2 has `/api/geoFeatures`, the format its own maps use.
It is compact but not GeoJSON: keys are abbreviated (`na` for name, `le` for level, `pn` for
parent name), and the coordinates arrive as a JSON *string* in `co`. The response is a bare
array with one object per org unit.

```jq-try
program: '.[0] | (.co |= .[0:60] + "...")'
ref: dhis2:geo-features-level-2
caption: One district in geoFeatures form, with the long coordinate string shortened for display.
expected: [{"id": "O6uvpzGd5pu", "code": "OU_264", "na": "Bo", "hcd": true, "hcu": false, "le": 2, "pg": "ImspTQPwCqd", "pi": "ImspTQPwCqd", "pn": "Sierra Leone", "ty": 2, "co": "[[[-11.5914,8.4875],[-11.5906,8.4769],[-11.5898,8.4717],[-11...", "dimensions": {}}]
```

The geometry type is given as a number in `ty`, and here is the trap: `ty` is `1` for points
and `2` for *both* Polygon and MultiPolygon. The real type has to be derived from the
coordinates themselves. After `fromjson`, the longest path into the coordinate array tells the
nesting depth: 1 for a point, 3 for a polygon, 4 for a multipolygon.

```jq-try
program: '[.[] | {ty, depth: (.co | fromjson | [paths | length] | max)}] | group_by(.depth) | map({ty: .[0].ty, depth: .[0].depth, districts: length})'
ref: dhis2:geo-features-level-2
caption: All thirteen districts have ty 2, but seven are nested three deep (Polygon) and six four deep (MultiPolygon).
expected: [[{"ty": 2, "depth": 3, "districts": 7}, {"ty": 2, "depth": 4, "districts": 6}]]
```

Those counts match the seven Polygons and six MultiPolygons of the GeoJSON endpoint. The full
conversion builds a Feature per entry, with readable property names:

```jq-try
program: |
  def geomtype: if length == 0 then null else ([paths | length] | max) as $d | {"1": "Point", "2": "LineString", "3": "Polygon", "4": "MultiPolygon"}["\($d)"] end;
  {type: "FeatureCollection",
   features: [.[] | (.co | fromjson) as $c | {
     type: "Feature",
     id,
     geometry: {type: ($c | geomtype), coordinates: $c},
     properties: {name: .na, code, level: .le, parent: .pn}
   }]}
ref: dhis2:geo-features-level-2
geojson: true
caption: Thirteen districts as a GeoJSON FeatureCollection, with Polygon and MultiPolygon told apart by depth.
digest: 0f1184b1a8c86a82f723cc34dcb165b1ed1719ebf49542c51d731996c1ab24c8
```

For points the conversion is simpler, since every entry has `ty` 1 and a two-number
position:

```jq-try
program: '{type: "FeatureCollection", features: [.[] | {type: "Feature", id, geometry: {type: "Point", coordinates: (.co | fromjson)}, properties: {name: .na, chiefdom: .pn}}]}'
ref: dhis2:geo-features-facilities-bo
geojson: true
caption: The 54 health facilities in Bo as points.
digest: fd8720ac1b786e5c4067cbe97ec04fd7375d01ab1bec17c0680cae50083c941b
```

## Simplifying properties

Web maps load faster with small properties. `|=` on `.properties` rewrites every feature's
properties while leaving geometry and ids alone:

```jq-try
program: '.features |= map(select(.properties.parent == "vWbkYPRmKyS") | .properties |= {name, code})'
ref: dhis2:org-units-geojson-level-4
geojson: true
caption: The eight facilities of one chiefdom (Baoma), with only name and code kept.
expected: [{"type": "FeatureCollection", "features": [{"type": "Feature", "id": "jNb63DIHuwU", "geometry": {"type": "Point", "coordinates": [-11.4382, 7.9294]}, "properties": {"name": "Baoma Station CHP", "code": "OU_573"}}, {"type": "Feature", "id": "azRICFoILuh", "geometry": {"type": "Point", "coordinates": [-11.5444, 7.9049]}, "properties": {"name": "Golu MCHP", "code": "OU_577"}}, {"type": "Feature", "id": "Umh4HKqqFp6", "geometry": {"type": "Point", "coordinates": [-11.4283, 7.9197]}, "properties": {"name": "Jembe CHC", "code": "OU_578"}}, {"type": "Feature", "id": "RzgSFJ9E46G", "geometry": {"type": "Point", "coordinates": [-11.6279, 7.8716]}, "properties": {"name": "Jormu MCHP", "code": "OU_579"}}, {"type": "Feature", "id": "egv5Es0QlQP", "geometry": {"type": "Point", "coordinates": [-11.5052, 7.8704]}, "properties": {"name": "Kigbai MCHP", "code": "OU_580"}}, {"type": "Feature", "id": "EuoA3Crpqts", "geometry": {"type": "Point", "coordinates": [-11.511, 7.9235]}, "properties": {"name": "Mbundorbu MCHP", "code": "OU_581"}}, {"type": "Feature", "id": "AnXoUM1tfNT", "geometry": {"type": "Point", "coordinates": [-11.4277, 8.0041]}, "properties": {"name": "Yakaji MCHP", "code": "OU_583"}}, {"type": "Feature", "id": "nX05QLraDhO", "geometry": {"type": "Point", "coordinates": [-11.4894, 7.9341]}, "properties": {"name": "Yamandu CHC", "code": "OU_585"}}]}]
```

The same pattern can round coordinates, which shrinks polygon files considerably. Four
decimals is about eleven metres:

```jq-try
program: '.features[0].geometry.coordinates |= walk(if type == "number" then . * 10000 | round / 10000 else . end) | .features[0].geometry.coordinates[0][0:3]'
ref: dhis2:org-units-geojson-level-3
caption: The first positions of the first chiefdom after rounding.
expected: [[[-11.3516, 8.0819], [-11.3553, 8.0796], [-11.3592, 8.0779]]]
```

## Joining values onto features

Choropleth maps colour areas by a value that usually comes from somewhere else: an analytics
query, a spreadsheet, another API. Pass the values in as an object keyed by feature id and
look each feature up:

```jq-try
program: '.features |= map(select(.properties.country | IN("NO", "SL")) | .properties += {country_name: $names[.properties.country]})'
ref: static:world-cities
options: {argjson: {names: {"NO": "Norway", "SL": "Sierra Leone"}}}
geojson: true
caption: Norwegian and Sierra Leonean cities, each with the country name joined from --argjson.
expected: [{"type": "FeatureCollection", "features": [{"type": "Feature", "id": 1, "geometry": {"type": "Point", "coordinates": [10.7522, 59.9139]}, "properties": {"name": "Oslo", "country": "NO", "population": 709037, "capital": true, "country_name": "Norway"}}, {"type": "Feature", "id": 2, "geometry": {"type": "Point", "coordinates": [5.3221, 60.3913]}, "properties": {"name": "Bergen", "country": "NO", "population": 291940, "capital": false, "country_name": "Norway"}}, {"type": "Feature", "id": 3, "geometry": {"type": "Point", "coordinates": [-13.2317, 8.4657]}, "properties": {"name": "Freetown", "country": "SL", "population": 1055964, "capital": true, "country_name": "Sierra Leone"}}, {"type": "Feature", "id": 4, "geometry": {"type": "Point", "coordinates": [-11.7383, 7.9644]}, "properties": {"name": "Bo", "country": "SL", "population": 174354, "capital": false, "country_name": "Sierra Leone"}}, {"type": "Feature", "id": 5, "geometry": {"type": "Point", "coordinates": [-11.1903, 7.8767]}, "properties": {"name": "Kenema", "country": "SL", "population": 200354, "capital": false, "country_name": "Sierra Leone"}}]}]
```

The same with DHIS2 district ids, keeping only the name and the joined value, and leaving
districts without a value at `null` so the map can show them as missing:

```jq-try
program: '[.features[] | {name: .properties.name, value: $values[.id]}] | {with_value: map(select(.value != null)), missing: map(select(.value == null) | .name)}'
ref: dhis2:org-units-geojson-level-2
options: {argjson: {values: {"O6uvpzGd5pu": 1204, "fdc6uOvgoji": 987, "lc3eMKXaEfw": 402, "jUb8gELQApl": 860}}}
caption: Four districts have a value; the other nine are listed as missing.
expected: [{"with_value": [{"name": "Bo", "value": 1204}, {"name": "Bombali", "value": 987}, {"name": "Bonthe", "value": 402}, {"name": "Kailahun", "value": 860}], "missing": ["Kambia", "Kenema", "Koinadugu", "Kono", "Moyamba", "Port Loko", "Pujehun", "Tonkolili", "Western Area"]}]
```

To produce the map itself, write the value into each feature's properties with
`.features |= map(.properties.value = $values[.id])` and keep the geometry.

## Summary

| Task | Pattern |
| --- | --- |
| filter features | `.features \|= map(select(...))` |
| count by geometry type | `.features \| group_by(.geometry.type)` |
| all positions of any geometry | a recursive `positions` function |
| bounding box | `min`/`max` per column, or `reduce` for one pass |
| point centroid | mean of longitudes and latitudes |
| geoFeatures to GeoJSON | `.co \| fromjson`, type from nesting depth, not from `ty` |
| slim properties | `.properties \|= {name, code}` |
| join values | `--argjson` object keyed by id, `$values[.id]` |
