---
title: Assignment and update
summary: Changing values inside a document with =, |= and the arithmetic update operators, and deleting what you no longer need.
level: 201
---

Most jq programs build new values: they pick fields, construct objects and collect arrays.
Just as often you want the opposite: keep the document exactly as it is and change one
small part of it. That is what the assignment operators are for. They take a *path
expression* on the left, such as `.server.port` or `.items[]`, and produce a copy of the
whole input with the values at those paths replaced.

Nothing is modified in place. jq values are immutable, so an assignment always outputs a
new document, and the original input is still available to the rest of the pipeline
through variables if you bound it.

The manual covers this in
[Assignment](https://jqlang.org/manual/v1.8/#assignment).

## Plain assignment with `=`

`path = value` sets every location matched by `path` to `value`. The output is the whole
input, not just the changed part.

```jq-try
program: '.port = 8443'
input: '{"host": "localhost", "port": 8080}'
caption: The whole object comes back, with one field replaced.
expected: [{"host": "localhost", "port": 8443}]
```

Paths that do not exist yet are created, including intermediate objects and arrays. Missing
array positions before the one you set are filled with `null`.

```jq-try
program: '.a.b[2] = "x"'
input: '{}'
caption: Objects and an array are created along the way; positions 0 and 1 become null.
expected: [{"a": {"b": [null, null, "x"]}}]
```

The right-hand side of `=` is evaluated against the *original input* `.`, not against the
value at the path. That makes `=` the right tool for copying a value from one place in the
document to another:

```jq-try
program: '.server.port = .environments.prod.server.port | .server'
ref: static:config
caption: The production port is copied into the base server settings.
expected: [{"host": "0.0.0.0", "port": 443, "tls": {"enabled": true, "cert": "/etc/ssl/app.pem", "key": "/etc/ssl/app.key"}, "timeouts": {"read": 30, "write": 30, "idle": 120}}]
```

## Update with `|=`

`path |= f` runs the filter `f` with the *current value at the path* as its input, and puts
the result back. Read it as "pipe the value at this path through `f`".

```jq-try
program: '.tags |= sort'
input: '{"name": "report", "tags": ["urgent", "draft", "finance"]}'
caption: Only the tags array is passed to sort; the rest of the object is untouched.
expected: [{"name": "report", "tags": ["draft", "finance", "urgent"]}]
```

The difference between `=` and `|=` is only where the right-hand side looks. The next
snippet runs the same right-hand side, `.b`, with both operators:

```jq-try
program: '(.a = .b), (.a |= .b)'
input: '{"a": {"b": 10}}'
caption: 'With =, .b is looked up on the whole input (there is no top-level b, so null); with |=, it is looked up on the value of .a.'
expected: [{"a": null}, {"a": 10}]
```

A quick rule of thumb:

| You want to | Use | Right side sees |
| --- | --- | --- |
| set a constant or copy from elsewhere in the document | `=` | the whole input |
| transform the value that is already there | `\|=` | the value at the path |
| add, subtract, multiply by something | `+=`, `-=`, `*=`, `/=`, `%=` | the whole input |
| fill in a missing or null value | `//=` | the whole input |

When the right-hand side of `|=` produces several outputs, only the first one is used. With
`=` each output of the right-hand side produces a separate copy of the document:

```jq-try
program: '[.a = (1, 2)], [.a |= (1, 2)]'
input: '{"a": 0}'
caption: '= gives one result per value on the right; |= keeps the first.'
expected: [[{"a": 1}, {"a": 2}], [{"a": 1}]]
```

## Arithmetic update operators

`+=`, `-=`, `*=`, `/=` and `%=` combine the current value at the path with the right-hand
side. `.a += 1` means `.a |= . + 1`, with one important detail: like `=`, the right-hand
side is evaluated against the whole input, not against the value at the path. See
[Arithmetic update-assignment](https://jqlang.org/manual/v1.8/#arithmetic-update-assignment).

```jq-try
program: '.a += 1 | .b -= 1 | .c *= 2 | .d /= 4 | .e %= 3'
input: '{"a": 1, "b": 1, "c": 3, "d": 10, "e": 10}'
caption: Each operator combines the old value with the number on the right.
expected: [{"a": 2, "b": 0, "c": 6, "d": 2.5, "e": 1}]
```

Because the right side sees the whole input, it can refer to a sibling field while
updating every element of an array:

```jq-try
program: '.items[] += .offset'
input: '{"offset": 100, "items": [1, 2, 3]}'
caption: .offset is read from the top-level object, once for the whole update.
expected: [{"offset": 100, "items": [101, 102, 103]}]
```

That same rule is a common source of confusion. It is tempting to write `.items[] = . + 1`,
expecting `.` to be each item. It is not: `.` on the right of `=` is the whole object, and
an object plus a number is an error.

```jq-try
program: '.items[] = . + 1'
input: '{"items": [1, 2]}'
error: cannot be added
caption: 'Common mistake: the right side of = sees the whole input. Use .items[] |= . + 1 or .items[] += 1.'
```

## Defaults with `//=`

`path //= value` sets the path only when its current value is `null` or `false` (or missing,
which reads as `null`). It is the update form of the alternative operator `//`, and the
usual way to fill in defaults.

```jq-try
program: 'map(.preferences.theme //= "system") | map(.preferences.theme)'
ref: static:users
caption: Margaret has no preferences at all, so her theme becomes "system"; the others keep theirs.
expected: [["dark", "light", "dark", "system", "dark", "light"]]
```

Keep in mind that `//` treats `false` as missing too. `//=` will overwrite a deliberate
`false`, which is usually not what you want for boolean settings:

```jq-try
program: '.debug //= true'
input: '{"debug": false}'
caption: 'Careful: false is replaced, because // treats false like null.'
expected: [{"debug": true}]
```

## Updating nested paths and many places at once

The left-hand side can be any path expression, including iteration and `select`. Every path
it produces is updated, and everything else is copied unchanged.

```jq-try
program: '(.employees[] | select(.dept == "eng") | .salary) += 5000 | [.employees[] | select(.dept == "eng") | {name, salary}]'
ref: static:employees
caption: Only engineers get the raise; the filter afterwards just shows the result.
expected: [[{"name": "Astrid", "salary": 155000}, {"name": "Bjorn", "salary": 103000}, {"name": "Chiara", "salary": 110000}, {"name": "Jonas", "salary": 35000}]]
```

`.[] |= f` updates every element of an array or every value of an object, keeping the
container type. For objects this is the same as `map_values(f)`.

```jq-try
program: '.[] |= ascii_upcase'
input: '{"first": "ada", "last": "lovelace"}'
caption: The keys stay, the values are transformed.
expected: [{"first": "ADA", "last": "LOVELACE"}]
```

The recursive descent `..` produces a path for every value in the document, so combined with
a type filter it updates values wherever they are:

```jq-try
program: '(.. | numbers) |= . * 10'
input: '{"a": 1, "b": [2, {"c": 3}], "d": "x"}'
caption: Every number at any depth is multiplied; the string is left alone.
expected: [{"a": 10, "b": [20, {"c": 30}], "d": "x"}]
```

A practical use is redaction: find the field wherever it is and replace it.

```jq-try
program: '(.. | objects | select(has("password")) | .password) = "***" | .database'
ref: static:config
caption: The database password is masked without spelling out its path.
expected: [{"driver": "postgres", "host": "db.internal", "port": 5432, "name": "weather", "pool": {"min": 2, "max": 20}, "password": "***"}]
```

## Left sides must be paths

Only expressions that describe a location can appear on the left: field access, indexing,
slices, `.[]`, `..`, `select`, `if`, `getpath`, `first`, `last` and pipes of these. A
filter that computes a new value, such as `tostring` or `length`, has no location, and jq
refuses it.

```jq-try
program: '(.a | tostring) = "x"'
input: '{"a": 1}'
error: Invalid path expression
caption: 'Common mistake: tostring produces a new value, not a path into the input.'
```

## Removing things: `|= empty` and `del`

In jq 1.8, updating a path to `empty` removes it. For arrays this removes the matching
elements; for objects it removes the key. (Before jq 1.7 this behaved inconsistently and
skipped elements, so older answers online often avoid it.)

```jq-try
program: '(.[] | select(. % 2 == 0)) |= empty'
input: '[1, 2, 3, 4, 5, 6]'
caption: Even numbers are removed from the array.
expected: [[1, 3, 5]]
```

The dedicated tool is [`del(path)`](https://jqlang.org/manual/v1.8/#del). It accepts
several paths separated by commas, and paths with `select`:

```jq-try
program: 'del(.[1, 2]), del(.[] | select(. > 25))'
input: '[10, 20, 30, 40]'
caption: Deleting two positions at once, then deleting by condition.
expected: [[10, 40], [10, 20]]
```

Assigning `null` is not the same as deleting. The key stays, with a `null` value, which
matters for `keys`, `has`, `length` and for any consumer that tells "absent" from "null"
apart:

```jq-try
program: '[(.b = null), del(.b)] | map({keys: keys, has_b: has("b")})'
input: '{"a": 1, "b": 2}'
caption: Assigning null keeps the key; del removes it.
expected: [[{"keys": ["a", "b"], "has_b": true}, {"keys": ["a"], "has_b": false}]]
```

To remove several fields from every element of a list, combine `map` with `del`, or use
`del` with an iterating path directly:

```jq-try
program: 'del(.[] | .email, .roles) | .[0] | keys'
ref: static:users
caption: 'del(.[] | .email, .roles) removes two fields from every user.'
expected: [["active", "address", "id", "last_login", "name", "preferences", "signup", "username"]]
```

## Building updates from paths

Every assignment is shorthand for the lower-level functions
[`getpath`](https://jqlang.org/manual/v1.8/#getpath),
[`setpath`](https://jqlang.org/manual/v1.8/#setpath) and
[`delpaths`](https://jqlang.org/manual/v1.8/#delpaths), which take paths as arrays. They are
useful when the path itself is data, for example a dotted string from a configuration file:

```jq-try
program: '($key | split(".")) as $p | setpath($p; $value) | getpath($p[0:2])'
ref: static:config
options: {args: {key: "database.pool.max", value: "50"}}
caption: 'The path comes from --arg. Note that --arg values are strings: the result is "50", not 50.'
expected: [{"min": 2, "max": "50"}]
```

With `reduce` you can apply a whole list of such changes in one go, which is how
environment overrides are usually merged. (`paths(scalars)` is safe here only because no
override is `false` or `null`; chapter 19 shows the condition that keeps those leaves too.)

```jq-try
program: '. as $root | reduce ($root.environments.prod | paths(scalars)) as $p ($root; setpath($p; $root.environments.prod | getpath($p))) | {server: .server.port, db: .database.host, pool: .database.pool}'
ref: static:config
caption: Every leaf of the prod overrides is written into the base config.
expected: [{"server": 443, "db": "db.prod.internal", "pool": {"min": 2, "max": 100}}]
```
