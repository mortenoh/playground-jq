---
title: Idioms and pitfalls
summary: A catalogue of short patterns worth knowing by heart, the mistakes that catch almost everyone, a few performance notes, and how dirigent runs jq.
level: 301
---

This last chapter collects patterns from the rest of the guide in one place, and adds the
traps that are easy to fall into even after years of using jq. Each entry is short and
runnable; follow the links to the earlier chapters for the full story.

## Idioms

### Defaults

`//` supplies a value when the left side is `null`, `false` or produces nothing. For whole
objects of defaults, merge the defaults *under* the data with `+`, where the right side wins:

```jq-try
program: 'map({theme: "system", language: "en"} + (.preferences // {}) | {theme, language})'
ref: static:users
caption: Margaret has no preferences, so she gets both defaults; everyone else keeps their own values.
expected: [[{"theme": "dark", "language": "en"}, {"theme": "light", "language": "en"}, {"theme": "dark", "language": "fi"}, {"theme": "system", "language": "en"}, {"theme": "dark", "language": "en"}, {"theme": "light", "language": "en"}]]
```

### Counting

`length` counts an array; to count matches, collect them first. `any` and `all` answer yes/no
questions without counting:

```jq-try
program: '{users: length, active: map(select(.active)) | length, any_without_email: any(.[]; .email == null), all_have_roles: all(.[]; .roles != [])}'
ref: static:users
caption: Six users, five active; Ken has no email and no roles.
expected: [{"users": 6, "active": 5, "any_without_email": true, "all_have_roles": false}]
```

### Frequency tables

Flatten the values you want to count into one array, then group, or count directly into an
object with `reduce`:

```jq-try
program: '([.[].roles[]] | group_by(.) | map({key: .[0], value: length}) | from_entries), (reduce .[].roles[] as $r ({}; .[$r] += 1))'
ref: static:users
caption: 'Two ways to the same table. group_by sorts the keys; reduce keeps them in first-seen order, which happens to be the same here.'
expected: [{"admin": 2, "editor": 3, "viewer": 2}, {"admin": 2, "editor": 3, "viewer": 2}]
```

### Deduplicate by key

`unique_by(f)` keeps one element per key, but sorts by the key. To keep the *first*
occurrence in the original order, remember the keys you have seen:

```jq-try
program: '(unique_by(.customer.id) | map(.id)), (reduce .[] as $o ({}; .[$o.customer.id] //= $o.id) | [.[]])'
ref: static:orders
caption: 'Both give one order per customer: the first sorted by customer id, the second in original order.'
expected: [["A-1002", "A-1005", "A-1001", "A-1004", "A-1007"], ["A-1001", "A-1002", "A-1004", "A-1005", "A-1007"]]
```

### Pivoting objects with to_entries

`to_entries` turns an object into `{key, value}` rows, which you can map over and turn back
with `from_entries` (or into strings, or into an array of objects):

```jq-try
program: '.server.timeouts | to_entries | map("\(.key)=\(.value)s") | join(", ")'
ref: static:config
caption: An object rendered as a single line of key=value pairs.
expected: ["read=30s, write=30s, idle=120s"]
```

### from_entries with dynamic keys

`from_entries` accepts `key`/`value`, `k`/`v`, `name`/`value` and the capitalised `Key`/`Value`
that AWS uses, so tag lists become objects in one step:

```jq-try
program: '[.Reservations[].Instances[] | {id: .InstanceId, state: .State.Name} + (.Tags | from_entries)] | map(select(.env == "prod")) | map({id, Name, state})'
ref: static:aws-ec2
caption: The tags become fields, so they can be filtered and selected like any other.
expected: [[{"id": "i-0aa11", "Name": "bastion", "state": "running"}, {"id": "i-0bb22", "Name": "api-1", "state": "running"}, {"id": "i-0bb23", "Name": "api-2", "state": "running"}, {"id": "i-0dd44", "Name": "db-replica", "state": "running"}]]
```

For keys computed from data, `{(expr): value}` builds a one-key object, and `add` merges many:

```jq-try
program: '.store.books | map({(.title): .price}) | add | with_entries(select(.value < 10))'
ref: static:bookstore
caption: A title-to-price lookup, then only the cheap ones.
expected: [{"Learning jq": 8.5, "Pipes and Paths": 6.25}]
```

### Safe navigation

Missing fields are not errors: `.a.b.c` on an object without `a` is `null`. Only a value of the
wrong type raises an error, and that is what `?` guards against:

```jq-try
program: 'map(.preferences.notifications.sms), map(.name.first.initial?)'
ref: static:users
caption: 'The first is null where there is no notifications object; the second would error on the first-name strings without ?, and outputs nothing instead.'
expected: [[false, false, null, null, true, false], []]
```

### Building strings

String interpolation for text, `join` for lists, and the `@csv`/`@tsv` formats for rows that
another tool will parse (they quote and escape correctly):

```jq-try
program: '.[] | [.username, .address.city, (.roles | join("+"))] | @csv'
ref: static:users
options: {raw_output: true}
caption: One CSV line per user. Note the empty string for Ken's empty roles list.
expected: ["\"ada\",\"London\",\"admin+editor\"", "\"grace\",\"New York\",\"editor\"", "\"linus\",\"Helsinki\",\"viewer\"", "\"margaret\",\"Boston\",\"admin\"", "\"ken\",\"Berkeley\",\"\"", "\"barbara\",\"Boston\",\"editor+viewer\""]
```

## Pitfalls

### Iterating null

`.[]` on `null` is an error. It happens when a field is missing on some records. Use `.[]?` to
skip, or `(.field // [])[]` to say explicitly that missing means empty:

```jq-try
program: '[.[] | .tags[]]'
input: '[{"tags": ["a"]}, {}]'
error: Cannot iterate over null
caption: The second record has no tags.
```

```jq-try
program: '[.[] | (.tags // [])[]]'
input: '[{"tags": ["a"]}, {}]'
caption: A missing list counts as empty.
expected: [["a"]]
```

### paths(scalars) drops false and null leaves

`paths(f)` keeps a path when `f` produces a truthy value for the leaf. `scalars` outputs the
leaf itself, so `false` and `null` leaves are dropped. Test the type instead:

```jq-try
program: '[paths(scalars)], [paths(type | IN("object", "array") | not)]'
input: '{"a": false, "b": null, "c": 1}'
caption: Only c survives the first; the second keeps all three.
expected: [[["c"]], [["a"], ["b"], ["c"]]]
```

### select produces nothing, not false

`select(cond)` outputs its input or *nothing*. Inside an object constructor, nothing means no
object at all, so records vanish:

```jq-try
program: '[.[] | {username, email: (.email | select(. != null))}] | length'
ref: static:users
caption: 'Five objects from six users: Ken''s whole record disappeared, not just his email.'
expected: [5]
```

To keep the record, use a value that can be `null` or a default: `email: .email` or
`email: (.email // "none")`.

### `//` treats false as missing

`.enabled // true` can never produce `false`, because `false` falls through to the default:

```jq-try
program: 'map(.enabled // true), map(if has("enabled") then .enabled else true end)'
input: '[{"enabled": false}, {"enabled": true}, {}]'
caption: The first loses the explicit false; checking with has keeps it.
expected: [[true, true, true], [false, true, true]]
```

### `=` versus `|=`

On the right of `=`, `.` is the whole input; on the right of `|=` it is the value being
updated. Mixing them up gives wrong values or errors:

```jq-try
program: '(.prices[] |= . * 2), (.prices[] = (.prices | max))'
input: '{"prices": [1, 5, 3]}'
caption: '|= doubles each price; = sets every price to the maximum, read from the whole input.'
expected: [{"prices": [2, 10, 6]}, {"prices": [5, 5, 5]}]
```

### Numbers stored as strings

JSON from forms and CSV conversions often has `"32.1"` where `32.1` was meant. jq orders every
string after every number, so a single string wins `max` and sorts last:

```jq-try
program: '[.readings[].celsius] | max, (map(numbers) | max), (map(tonumber? // empty) | max)'
ref: static:sensor-readings
caption: 'The string "32.1" is the "maximum". Dropping non-numbers or converting gives 36.1.'
expected: ["32.1", 36.1, 36.1]
```

### Comparing strings and numbers

Strings compare character by character, so `"10"` is less than `"9"`, and any number is less
than any string. Sorting ids or versions stored as strings needs a conversion:

```jq-try
program: '("10" < "9"), (100 < "9"), (["10", "9", "100"] | sort, sort_by(tonumber))'
input: 'null'
caption: 'Lexicographic comparison, then numbers before strings, then a numeric sort of numeric strings.'
expected: [true, true, ["10", "100", "9"], ["9", "10", "100"]]
```

### Key order

Objects are equal regardless of key order, and `keys` sorts. But key order is preserved in
output, in `keys_unsorted`, in `to_entries`, and in `tojson`, so textual comparisons can
differ even when values are equal:

```jq-try
program: '{b: 1, a: 2} as $x | {a: 2, b: 1} as $y | {equal: ($x == $y), same_json: (($x | tojson) == ($y | tojson)), keys: ($x | keys), unsorted: ($x | keys_unsorted)}'
input: 'null'
caption: 'Equal values, different text. Use -S (sort_keys) when output must be byte-for-byte stable.'
expected: [{"equal": true, "same_json": false, "keys": ["a", "b"], "unsorted": ["b", "a"]}]
```

## Performance notes

jq is fast for the data sizes people usually pipe through it, but a few patterns scale badly:

- **Scanning inside a loop.** `map(. as $x | $all | map(select(.id == $x.ref)))` is quadratic.
  Build `INDEX(.id)` once and look up by key.
- **group_by per element.** Grouping sorts the whole array. Compute the groups once, bind them
  to a variable, then use them.
- **Slurping huge inputs.** `-s` holds everything in memory; `-n` with `reduce inputs` holds
  only the state. See the streaming chapter.
- **Pretty-printing between tools.** `-c` writes one value per line, which is smaller and is
  what the next jq (or any NDJSON tool) reads best.

The quadratic and the indexed version of "how many colleagues in the same department" give
the same result; only the second scales:

```jq-try
program: |
  .employees as $all
  | ([$all[] | .dept as $d | {name, colleagues: ([$all[] | select(.dept == $d)] | length - 1)}]) as $slow
  | (reduce $all[] as $e ({}; .[$e.dept] += 1)) as $count
  | ([$all[] | {name, colleagues: ($count[.dept] - 1)}]) as $fast
  | {same: ($slow == $fast), sample: $fast[0:3]}
ref: static:employees
caption: One pass to count per department, then a constant-time lookup per employee.
expected: [{"same": true, "sample": [{"name": "Astrid", "colleagues": 3}, {"name": "Bjorn", "colleagues": 3}, {"name": "Chiara", "colleagues": 3}]}]
```

## How dirigent runs jq

The workflow engine dirigent runs jq 1.8.2 programs in three transform blocks, with a few
differences from the command line that are worth knowing when you prototype here:

| Command-line jq | dirigent |
| --- | --- |
| a program may emit any number of outputs | `transform.jq`: one output is the value, several become a list, none fails the step |
| | `map.jq`: exactly one output per element |
| | `filter.jq`: exactly one `true` or `false` per element |
| `$ENV` and `env` read the process environment | both are an empty object |
| `--arg`, `input`, files | none; arguments are composed into the input |

This playground replaces the environment with a fixed stand-in so that examples are
reproducible; dirigent gives an empty object. Either way, a program should not depend on it:

```jq-try
program: '$ENV | keys'
input: 'null'
caption: The playground's stand-in environment. In dirigent the same program outputs [].
expected: [["HOME", "LANG", "PAGER", "SHELL", "TZ", "USER"]]
```

For per-element blocks, write programs that always produce exactly one value. `select` and
`.[]` are the usual culprits: the first can produce none, the second many. Running a program
over several inputs shows the problem:

```jq-try
program: '.tags[]?'
input: '{"id": 1, "tags": ["a", "b"]} {"id": 2}'
caption: Two outputs for the first element and none for the second; a map.jq step would refuse both.
expected: ["a", "b"]
```

```jq-try
program: '{id, tags: ((.tags // []) | join(","))}'
input: '{"id": 1, "tags": ["a", "b"]} {"id": 2}'
caption: Exactly one output per element, whatever the tags look like.
expected: [{"id": 1, "tags": "a,b"}, {"id": 2, "tags": ""}]
```

A filter block wants a boolean, not the element. Write the condition itself, and make sure it
is a boolean even for odd data:

```jq-try
program: '.status == "active" and (.celsius | type) == "number"'
input: '{"status": "active", "celsius": 31.2} {"status": "offline", "celsius": null} {"status": "active", "celsius": "32.1"}'
caption: One boolean per reading; the string temperature is rejected rather than raising an error.
expected: [true, false, false]
```

Arguments arrive as part of the input. Destructure them at the start of the program:

```jq-try
program: '. as {$threshold, $readings} | [$readings[] | select(.celsius | numbers > $threshold) | .station]'
input: '{"threshold": 35, "readings": [{"station": "KEN-02", "celsius": 35.6}, {"station": "BO-01", "celsius": 33.8}, {"station": "MAK-01", "celsius": 36.1}]}'
caption: The threshold travels with the data instead of arriving as --arg.
expected: [["KEN-02", "MAK-01"]]
```
