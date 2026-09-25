---
title: Streaming
summary: Processing JSON as a sequence of path/value events with --stream, tostream, fromstream and truncate_stream, and choosing between line-by-line, -s and -n with inputs for newline-delimited JSON.
level: 301
---

By default jq parses each input value completely before the program sees it. For most data
that is exactly right. Two situations call for something else: a single document too large to
hold in memory comfortably, and files with many values, one per line (NDJSON, JSON Lines),
where you need to decide whether to look at them one at a time or all together.

This chapter covers both. The streaming form of JSON is described in the manual under
[Streaming](https://jqlang.org/manual/v1.8/#streaming). Snippets with the `--stream` flag run
on the jq command-line binary automatically.

## The event form of a document

[`tostream`](https://jqlang.org/manual/v1.8/#tostream) turns a value into a sequence of
*events*. Each leaf becomes a two-element event `[path, leaf]`. When an array or object ends,
a one-element event `[path]` marks the closing, where `path` is the path of the last element
that was inside it.

```jq-try
program: '[tostream]'
input: '{"a": [1, {"b": 2}]}'
caption: 'Two leaf events, then three closing events: for {"b": 2}, for the array, and for the top-level object.'
expected: [[[["a", 0], 1], [["a", 1, "b"], 2], [["a", 1, "b"]], [["a", 1]], [["a"]]]]
```

The `--stream` flag makes jq's parser produce these same events directly from the input
text, without ever building the whole value. The program then runs once per event:

```jq-try
program: '.'
input: '{"a": [1, {"b": 2}]}'
options: {stream: true}
caption: The same five events, now produced by the parser.
expected: [[["a", 0], 1], [["a", 1, "b"], 2], [["a", 1, "b"]], [["a", 1]], [["a"]]]
```

Scalars and empty containers are leaves at the top level too, with an empty path:

```jq-try
program: '.'
input: '3 [] {}'
options: {stream: true}
caption: Three separate inputs, each a single event with the path [].
expected: [[[], 3], [[], []], [[], {}]]
```

## Filtering events

Because every event carries its full path, you can find values anywhere in a document by
looking at the path alone. Leaves are the events of length 2:

```jq-try
program: 'select(length == 2 and .[0][-1] == "title") | .[1]'
ref: static:bookstore
options: {stream: true}
caption: Every title, found by the last element of its path. No book object is ever built.
expected: ["Learning jq", "JSON at Scale", "Pipes and Paths", "The Art of the Shell", "Functional Filters", "Data Wrangling Recipes", "Regular Expressions Unleashed", "Streams and Generators"]
```

With `-n` and `inputs`, one run sees all events and can aggregate them. Here, counting the
leaves of the configuration:

```jq-try
program: 'reduce (inputs | select(length == 2)) as $e (0; . + 1)'
ref: static:config
options: {stream: true, null_input: true}
caption: The configuration has 39 leaf values.
expected: [39]
```

`first` stops reading as soon as it has a result, which with a streaming parser means the rest
of the file is never parsed:

```jq-try
program: 'first(inputs | select(.[0][-1] == "host") | .[1])'
ref: static:config
options: {stream: true, null_input: true}
caption: The first host in document order is server.host.
expected: ["0.0.0.0"]
```

The same technique scales to large files. The chiefdom boundaries of Sierra Leone are over a
megabyte of coordinates; picking out the names only needs the events whose path ends in
`properties, name`:

```jq-try
program: '[inputs | select(length == 2 and .[0][2:] == ["properties", "name"]) | .[1]] | length, .[0:3]'
ref: dhis2:org-units-geojson-level-3
options: {stream: true, null_input: true}
caption: 152 chiefdom names, without building a single polygon.
expected: [152, ["Badjia", "Bagruwa", "Baoma"]]
```

## Rebuilding values: fromstream and truncate_stream

[`fromstream(f)`](https://jqlang.org/manual/v1.8/#fromstream) does the reverse of `tostream`:
it collects events and outputs a value each time one is complete.

```jq-try
program: 'fromstream(tostream)'
input: '{"a": [1, {"b": 2}]}'
caption: A round trip gives back the original value.
expected: [{"a": [1, {"b": 2}]}]
```

On its own that only rebuilds what you started with. The useful part is to rebuild *pieces*.
[`truncate_stream(depth; events)`](https://jqlang.org/manual/v1.8/#truncate_stream), usually
written `depth | truncate_stream(events)`, removes the first `depth` elements from each event
path and drops events that do not reach that deep. Values that sat at that depth become
top-level values:

```jq-try
program: '[1 | truncate_stream([[0], 1], [[1, 0], 2], [[1, 0]], [[1]])]'
input: 'null'
caption: 'The events of [1, [2]]: the leaf at [0] is too shallow and disappears; [1, 0] becomes [0].'
expected: [[[[0], 2], [[0]]]]
```

The classic streaming idiom splits a huge top-level array into its elements, one output per
element, while holding only one element in memory at a time:

```jq-try
program: 'fromstream(1 | truncate_stream(inputs))'
input: '[{"id": 1}, {"id": 2}, {"id": 3}]'
options: {stream: true, null_input: true, compact: true}
caption: Three separate outputs instead of one array.
expected: [{"id": 1}, {"id": 2}, {"id": 3}]
```

For an array deeper inside a document, first select the events under it, then truncate by
its depth. The books sit at `store.books[i]`, three levels down:

```jq-try
program: '[fromstream(3 | truncate_stream(inputs | select(.[0][0:2] == ["store", "books"]))) | {title, price}] | .[0:3]'
ref: static:bookstore
options: {stream: true, null_input: true}
caption: Each book is rebuilt as a complete object, then used like any other value.
expected: [[{"title": "Learning jq", "price": 8.5}, {"title": "JSON at Scale", "price": 24.0}, {"title": "Pipes and Paths", "price": 6.25}]]
```

## Newline-delimited JSON

Many logs and exports hold one JSON value per line. jq reads such a file as a sequence of
separate inputs, and there are three ways to run a program over it.

**One input at a time** (the default). The program runs once per line, and cannot see the
other lines. This is the right choice for filtering and reshaping records:

```jq-try
program: 'select(.level == "error") | "\(.service) \(.status) \(.path)"'
ref: static:access-log
options: {raw_output: true}
caption: Each line is tested on its own; three are errors.
expected: ["api 500 /v1/alerts", "worker 500 job:refresh-radar", "api 503 /v1/alerts"]
```

A common mistake is to use an array function on this form. `length` then runs once per line,
on each object, and counts its keys:

```jq-try
program: 'length'
ref: static:access-log
caption: 'Common mistake: sixteen outputs of 7 (the number of fields), not the number of lines.'
expected: [7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7]
```

**Slurp** (`-s`). All lines are read into one array first, and the program runs once on it.
It is the simplest way to count, sort or group across lines:

```jq-try
program: 'length, (group_by(.service) | map({service: .[0].service, requests: length}))'
ref: static:access-log
options: {slurp: true}
caption: Sixteen lines, grouped by service.
expected: [16, [{"service": "api", "requests": 11}, {"service": "auth", "requests": 3}, {"service": "worker", "requests": 2}]]
```

**Null input with inputs** (`-n`). The program runs once, and pulls lines with `inputs`. It
sees everything, like `-s`, but never builds the array; with `reduce` or `foreach` only the
running state is kept in memory:

```jq-try
program: 'reduce inputs as $line ({}; .[$line.service] += 1)'
ref: static:access-log
options: {null_input: true}
caption: The same counts as above, built one line at a time.
expected: [{"api": 11, "auth": 3, "worker": 2}]
```

```jq-try
program: 'reduce inputs as $l ({count: 0, total: 0, max: 0}; .count += 1 | .total += $l.latency_ms | .max = ([.max, $l.latency_ms] | max)) | .mean = (.total / .count | round)'
ref: static:access-log
options: {null_input: true}
caption: Latency statistics in a single pass, with constant memory.
expected: [{"count": 16, "total": 34370, "max": 30211, "mean": 2148}]
```

## Choosing an approach

| Situation | Approach | Memory |
| --- | --- | --- |
| Filter or reshape each record of NDJSON | default, one input at a time | one record |
| Aggregate NDJSON, data fits in memory | `-s` and array functions | all records |
| Aggregate NDJSON, large or unbounded input | `-n` with `reduce inputs` | the state |
| One huge document, need a few values from it | `--stream` with `select` on paths | one event |
| One huge array, process each element | `--stream -n` with `fromstream(1 \| truncate_stream(inputs))` | one element |

A few practical notes:

- `-s` is convenient but holds the entire input as one value; for gigabyte files, prefer
  `-n` with `inputs`.
- `--stream` is slower than normal parsing for small documents, since every leaf becomes an
  array. Use it when memory is the problem, not by default.
- `-c` (compact output) keeps one value per line, so the output of one jq can be the NDJSON
  input of the next.
- Programs that use `input`, `inputs` or `--stream` run on the jq binary in this playground,
  exactly as they would in a shell.
