---
title: Recursion and trees
summary: Walking nested data with recurse, .. and walk, flattening trees into rows and building them back, and navigating the DHIS2 org unit hierarchy through its path strings.
level: 301
---

Trees are everywhere in JSON: categories with subcategories, configuration with nested
sections, comment threads, file systems, and the organisation unit hierarchy of DHIS2. jq has
a small set of tools that visit every node of such a structure without you writing the
recursion yourself, and the ones you do write tend to be short.

This chapter uses two trees. `static:category-tree` is a nested tree: each node has `name`,
`id` and a `children` array. `dhis2:org-unit-tree` is the same idea stored the way databases
store it: a flat list of 166 org units, each with a `level`, a `parent` reference, a list of
`children` ids and a `path` string such as `/ImspTQPwCqd/O6uvpzGd5pu`.

## recurse and `..`

[`recurse(f)`](https://jqlang.org/manual/v1.8/#recurse) outputs its input, then applies `f`
and recurses into each result, depth first. For a tree with a `children` array, that is
every node, in document order:

```jq-try
program: '[recurse(.children[]) | .name]'
ref: static:category-tree
caption: All eleven nodes, parents before their children.
expected: [["root", "Books", "Programming", "jq", "Python", "Fiction", "Music", "Jazz", "Bebop", "Folk", "Games"]]
```

`recurse` with no argument is `recurse(.[]?)`: it descends into every array element and
object value. `..` is shorthand for it. It visits containers *and* scalars, so it is usually
followed by a type filter:

```jq-try
program: '[..], [.. | numbers]'
input: '{"a": [1, {"b": 2}], "c": "x"}'
caption: 'Every value in the document first, then only the numbers at any depth.'
expected: [[{"a": [1, {"b": 2}], "c": "x"}, [1, {"b": 2}], 1, {"b": 2}, 2, "x"], [1, 2]]
```

`recurse(f; cond)` stops as soon as a value fails `cond`. It works on any value, not only on
documents, and is a compact way to generate a sequence:

```jq-try
program: '[recurse(. * .; . < 1000)]'
input: '2'
caption: Square repeatedly while the result stays below 1000.
expected: [[2, 4, 16, 256]]
```

A frequent mistake is to recurse with a path that does not exist on every node. A node
without a `children` field gives `null`, and iterating `null` is an error. `.children[]?`
makes the step optional:

```jq-try
program: '[recurse(.children[]) | .name]'
input: '{"name": "a", "children": [{"name": "b"}]}'
error: Cannot iterate over null
caption: 'Common mistake: b has no children field. Write recurse(.children[]?).'
```

## Leaves, depth and counts

With every node available as a stream, questions about the tree become one-line filters.
The leaves are the nodes with no children:

```jq-try
program: '[.. | objects | select(.children == []) | .name]'
ref: static:category-tree
caption: Six leaves. Using .. here also works because only the nodes are objects.
expected: [["jq", "Python", "Fiction", "Bebop", "Folk", "Games"]]
```

Depth needs recursion, because it combines results from the children. Write a small function
that returns 1 for a leaf and one more than the deepest child otherwise:

```jq-try
program: |
  def depth: 1 + ([.children[] | depth] | max // 0);
  depth
ref: static:category-tree
caption: root, Books, Programming, jq; four levels. max of an empty array is null, hence // 0.
expected: [4]
```

The same answer can be read from the paths: every node sits at a path like
`["children", 0, "children", 1]`, two path elements per level.

```jq-try
program: '[paths(objects | has("name")) | length / 2] | max + 1'
ref: static:category-tree
caption: The longest node path has 6 elements, 3 steps below the root, which is level 4.
expected: [4]
```

## Flattening a tree into rows

Relational tools, spreadsheets and APIs such as DHIS2 prefer trees as flat rows with a
parent reference. A recursive function with a value argument carries the parent id down:

```jq-try
program: |
  def rows($parent): {id, name, parent: $parent}, (.id as $id | .children[] | rows($id));
  [rows(null)] | .[0:5]
ref: static:category-tree
caption: The first five rows. Each node reports its own id and the id it was reached from.
expected: [[{"id": 0, "name": "root", "parent": null}, {"id": 1, "name": "Books", "parent": 0}, {"id": 2, "name": "Programming", "parent": 1}, {"id": 3, "name": "jq", "parent": 2}, {"id": 4, "name": "Python", "parent": 2}]]
```

Breadcrumbs work the same way, carrying the list of ancestor names instead of one id:

```jq-try
program: |
  def crumbs($above): ($above + [.name]) as $here
    | {id, path: ($here | join(" > "))}, (.children[] | crumbs($here));
  [crumbs([])] | map(select(.id == 3 or .id == 8))
ref: static:category-tree
caption: Two deep nodes with the full trail from the root.
expected: [[{"id": 3, "path": "root > Books > Programming > jq"}, {"id": 8, "path": "root > Music > Jazz > Bebop"}]]
```

Without writing a function, `path(..)` gives the location of every node, and the prefixes of
that location are its ancestors. For this tree the ancestors sit at every even-length prefix:

```jq-try
program: '[path(.. | objects) as $p | [range(0; ($p | length) + 1; 2) as $i | getpath($p[0:$i]).name] | join("/")] | .[-3:]'
ref: static:category-tree
caption: 'getpath on each prefix of the node''s path looks up its ancestors.'
expected: [["root/Music/Jazz/Bebop", "root/Music/Folk", "root/Games"]]
```

## Building a tree from rows

The reverse direction starts from the rows and asks, for each node, which rows name it as
their parent. The rows are bound to a variable so the recursive function can search them:

```jq-try
program: |
  def rows($parent): {id, name, parent: $parent}, (.id as $id | .children[] | rows($id));
  . as $original
  | [rows(null)] as $rows
  | def build($id): [$rows[] | select(.parent == $id) | {name, id, children: build(.id)}];
    build(null)[0] == $original
ref: static:category-tree
caption: Flatten, rebuild, compare. Objects compare by content, so key order does not matter.
expected: [true]
```

The search inside `build` scans all rows for every node, which is quadratic. For a few
hundred rows that is fine; for larger inputs, group the rows by parent first (see
`group_by` and `INDEX` in the chapter on SQL-style operators).

## The DHIS2 org unit tree

In DHIS2 every org unit carries its ancestry in `path`: the ids from the root down to itself,
separated by `/`. The number of ids is the level, and a quick check confirms that the
snapshot agrees:

```jq-try
program: 'all(.organisationUnits[]; (.path | split("/") | length - 1) == .level)'
ref: dhis2:org-unit-tree
caption: For every unit, the number of ids in the path equals its level.
expected: [true]
```

Turning a path into readable breadcrumbs needs a lookup from id to name. `INDEX(.id)` builds
an object keyed by id once, and each path is then mapped through it:

```jq-try
program: '(.organisationUnits | INDEX(.id)) as $by | [.organisationUnits[] | select(.level == 3) | .path | split("/")[1:] | map($by[.].name) | join(" / ")] | .[0:3]'
ref: dhis2:org-unit-tree
caption: The first three chiefdoms (the list is ordered by level, then name) with their district and country.
expected: [["Sierra Leone / Bo / Badjia", "Sierra Leone / Moyamba / Bagruwa", "Sierra Leone / Bo / Baoma"]]
```

Descendants are the units whose path starts with this unit's path followed by a slash. That
answers "how many chiefdoms per district" without following any links:

```jq-try
program: '.organisationUnits as $all | [$all[] | select(.level == 2) | .path as $p | {name, chiefdoms: ([$all[] | select(.path | startswith($p + "/"))] | length)}] | sort_by(-.chiefdoms) | .[0:5]'
ref: dhis2:org-unit-tree
caption: 'The five districts with the most chiefdoms; Kailahun, Kono and Moyamba tie at 14, and the stable sort keeps them in their original order.'
expected: [[{"name": "Kenema", "chiefdoms": 16}, {"name": "Bo", "chiefdoms": 15}, {"name": "Kailahun", "chiefdoms": 14}, {"name": "Kono", "chiefdoms": 14}, {"name": "Moyamba", "chiefdoms": 14}]]
```

The `parent` and `children` fields must agree with each other. Every unit except the root has
a parent, so the children lists of levels 1 and 2 should add up to the number of units below
level 1 (level 3 lists its facilities, which are not in this snapshot):

```jq-try
program: '.organisationUnits | {with_parent: map(select(.parent)) | length, listed_children: (map(select(.level < 3) | .children | length) | add)}'
ref: dhis2:org-unit-tree
caption: 165 and 165; the two directions of the hierarchy are consistent.
expected: [{"with_parent": 165, "listed_children": 165}]
```

The same `build` pattern turns the flat list into a nested tree. The summary at the end
checks its shape instead of printing all 166 nodes:

```jq-try
program: |
  .organisationUnits as $all
  | def kids($id): [$all[] | select(.parent.id == $id) | {name, children: kids(.id)}];
    {name: "Sierra Leone", children: kids("ImspTQPwCqd")}
  | {name, districts: (.children | length), chiefdoms: ([.children[].children[]] | length), bo: (.children[] | select(.name == "Bo") | .children[0:3] | map(.name))}
ref: dhis2:org-unit-tree
caption: 13 districts and 152 chiefdoms in the rebuilt tree, and the first chiefdoms under Bo.
expected: [{"name": "Sierra Leone", "districts": 13, "chiefdoms": 152, "bo": ["Badjia", "Baoma", "Bargbe"]}]
```

## Rewriting a tree with walk

[`walk(f)`](https://jqlang.org/manual/v1.8/#walk) applies `f` to every value bottom-up: the
children are rewritten first, then the parent sees the rewritten children. Use it to change
every node the same way, for example to sort each level by name:

```jq-try
program: 'walk(if type == "object" and has("children") then .children |= sort_by(.name) else . end) | [recurse(.children[]) | .name]'
ref: static:category-tree
caption: 'Siblings are sorted at every level, by codepoint: Python comes before jq because uppercase letters sort first.'
expected: [["root", "Books", "Fiction", "Programming", "Python", "jq", "Games", "Music", "Folk", "Jazz", "Bebop"]]
```

or to drop empty `children` arrays so leaves become plain objects:

```jq-try
program: 'walk(if type == "object" and .children == [] then del(.children) else . end) | .children[1]'
ref: static:category-tree
caption: Leaves lose the empty array; inner nodes keep theirs.
expected: [{"name": "Music", "id": 6, "children": [{"name": "Jazz", "id": 7, "children": [{"name": "Bebop", "id": 8}]}, {"name": "Folk", "id": 9}]}]
```

`walk` visits scalars too, so the condition has to check the type before it looks at fields.

## Flattening nested objects to dotted keys

A last common task is the opposite of nesting: turn every leaf into a `key: value` pair
where the key is its path. [`paths(f)`](https://jqlang.org/manual/v1.8/#paths) gives the
leaf paths and `getpath` their values:

```jq-try
program: '[paths(scalars) as $p | {key: ($p | map(tostring) | join(".")), value: getpath($p)}] | from_entries'
input: '{"server": {"host": "db", "ports": [5432, 5433]}, "debug": false}'
caption: 'Array indices become digits in the key. But debug is missing.'
expected: [{"server.host": "db", "server.ports.0": 5432, "server.ports.1": 5433}]
```

The `debug` leaf is gone. `paths(f)` keeps a path when `f`, applied to the value there,
produces a *truthy* result, and `scalars` passes its input through unchanged: for the value
`false` it outputs `false`, which counts as "no". The same happens to `null` leaves (and to
`leaf_paths` in older jq versions, which was defined as `paths(scalars)` and is gone in 1.8).
Test the type instead, so the condition is always `true` or `false` and never the leaf value
itself:

```jq-try
program: '[paths(type | IN("object", "array") | not) as $p | {key: ($p | map(tostring) | join(".")), value: getpath($p)}] | from_entries'
input: '{"server": {"host": "db", "ports": [5432, 5433]}, "debug": false, "note": null}'
caption: Every leaf is kept, including false and null.
expected: [{"server.host": "db", "server.ports.0": 5432, "server.ports.1": 5433, "debug": false, "note": null}]
```
