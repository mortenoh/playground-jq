---
title: Strings
summary: Building, splitting, trimming, testing and converting text, including code points and raw lines.
level: 201
---

JSON data is full of text: names, identifiers, dates, paths, whole CSV lines when you read raw
input. jq strings are sequences of Unicode code points, and the language has a compact set of
tools to take them apart and put them together. This chapter covers the plain string functions;
chapter 14 adds regular expressions and chapter 15 the `@format` escapes.

## String interpolation

Inside a string literal, `\(expr)` runs `expr` against the current input and inserts the
result. Strings are inserted as they are; every other value is inserted as its compact JSON
text, so `null` becomes `null` and an array becomes `[1,2]`. Interpolation is usually clearer
than joining pieces with `+`, and it never fails on numbers.

```jq-try
program: '"\(.title) by \(.author), \(.year)"'
input: '{"title": "Learning jq", "author": "Ada Filter", "year": 2021}'
caption: Fields dropped into a sentence; the number needs no conversion.
expected: ["Learning jq by Ada Filter, 2021"]
```

```jq-try
program: '"sum=\(.a + .b) list=\(.list) missing=\(.nope)"'
input: '{"a": 1, "b": 2, "list": [1, 2]}'
caption: Any expression works inside the parentheses; non-strings appear as JSON.
expected: ["sum=3 list=[1,2] missing=null"]
```

```jq-try
program: '.name + " is " + .age'
input: '{"name": "Astrid", "age": 41}'
caption: 'Common mistake: + does not convert numbers to strings. Use interpolation or tostring.'
error: 'cannot be added'
```

## Splitting and joining

[`split(sep)`](https://jqlang.org/manual/v1.8/#split-1) cuts a string at every occurrence of a
literal separator and returns an array. [`join(sep)`](https://jqlang.org/manual/v1.8/#join) does
the reverse. `join` accepts numbers, booleans and `null` in the array (null becomes an empty
string), but not arrays or objects.

```jq-try
program: 'split(",") | map(ascii_upcase) | join(" | ")'
input: '"oslo,bergen,riga"'
caption: Split on commas, change each piece, join with a new separator.
expected: ["OSLO | BERGEN | RIGA"]
```

```jq-try
program: 'join("-")'
input: '["a", 1, null, true]'
caption: Scalars are converted; null becomes an empty piece.
expected: ["a-1--true"]
```

Division is another spelling of `split`: `"a,b" / ","` is `["a", "b"]`. Multiplying a string by
a number repeats it; in jq 1.8, multiplying by zero gives an empty string.

```jq-try
program: '("a,b,c" / ","), ("ab" * 3), ("-" * 10), ("ab" * 0)'
options: {null_input: true}
caption: 'String division splits, string multiplication repeats.'
expected: [["a", "b", "c"], "ababab", "----------", ""]
```

## Changing case

[`ascii_downcase` and `ascii_upcase`](https://jqlang.org/manual/v1.8/#ascii_downcase-ascii_upcase)
change only the ASCII letters A to Z. Other letters, such as "é", are left alone. For
case-insensitive comparisons, lowercase both sides.

```jq-try
program: 'ascii_upcase, ascii_downcase'
input: '"Héllo World"'
caption: The "é" is not ASCII and keeps its case.
expected: ["HéLLO WORLD", "héllo world"]
```

```jq-try
program: '[.[] | select(ascii_downcase == "jq")]'
input: '["JQ", "jq", "Jq", "json"]'
caption: A case-insensitive match by lowercasing first.
expected: [["JQ", "jq", "Jq"]]
```

## Trimming

[`ltrimstr(s)` and `rtrimstr(s)`](https://jqlang.org/manual/v1.8/#ltrimstr) remove a prefix or
suffix if it is there, and otherwise return the string unchanged. That makes them safe to apply
to every string in a list. The input must be a string, though: since jq 1.8 a number or `null`
is an error rather than passing through. jq 1.8 also adds [`trim`, `ltrim` and `rtrim`](https://jqlang.org/manual/v1.8/#trim-ltrim-rtrim),
which remove whitespace from both ends, the start or the end.

```jq-try
program: 'map(ltrimstr("v") | rtrimstr("-beta"))'
input: '["v1.2.0", "1.3.0", "v2.0.0-beta"]'
caption: Prefix and suffix removed only where present.
expected: [["1.2.0", "1.3.0", "2.0.0"]]
```

```jq-try
program: 'map(ltrimstr("v"))'
input: '["v1.2.0", 2]'
caption: 'Common mistake: the number 2 is not a string, so ltrimstr fails on it.'
error: 'requires string inputs'
```

```jq-try
program: '[trim, ltrim, rtrim]'
input: '"  padded  "'
caption: Both ends, the left end, the right end.
expected: [["padded", "padded  ", "  padded"]]
```

## Prefixes and suffixes

[`startswith(s)`](https://jqlang.org/manual/v1.8/#startswith) and
[`endswith(s)`](https://jqlang.org/manual/v1.8/#endswith) return booleans and fit naturally in
`select`.

```jq-try
program: '[.store.books[] | select(.title | startswith("The")) | .title], [.store.books[].isbn | select(endswith("-5"))]'
ref: static:bookstore
caption: Titles starting with "The", and ISBNs ending in "-5".
expected: [["The Art of the Shell"], ["978-0-00-000003-5"]]
```

## Substrings with test

`contains` works on strings, but [`test(re)`](https://jqlang.org/manual/v1.8/#test) is the more
flexible substring test: it takes a regular expression (a plain word is a valid one) and
optional flags, such as `"i"` for case-insensitive matching. Chapter 14 covers the rest.

```jq-try
program: '[.store.books[] | select(.title | test("and")) | .title], [.store.books[] | select(.title | test("JQ"; "i")) | .title]'
ref: static:bookstore
caption: A case-sensitive substring, then a case-insensitive one.
expected: [["Pipes and Paths", "Streams and Generators"], ["Learning jq"]]
```

## Converting: tostring, tonumber and @text

[`tostring`](https://jqlang.org/manual/v1.8/#tostring) leaves strings alone and turns anything
else into its JSON text. `@text` does the same thing. [`tonumber`](https://jqlang.org/manual/v1.8/#tonumber)
parses a string as a number and leaves numbers alone; it fails on anything that is not exactly a
number, including surrounding spaces.

```jq-try
program: 'map(tostring)'
input: '[1, "a", null, {"a": 1}, [1, 2]]'
caption: Only the string passes through unchanged; the rest become JSON text.
expected: [["1", "a", "null", "{\"a\":1}", "[1,2]"]]
```

```jq-try
program: 'map(tonumber) | add'
input: '["1.5", "2", "10"]'
caption: Numbers read from text, then summed.
expected: [13.5]
```

```jq-try
program: '.[] | tonumber'
input: '["42", " 42"]'
caption: 'Common mistake: whitespace makes tonumber fail. Trim first.'
expected: [42]
error: 'cannot be parsed as a number'
```

```jq-try
program: '.[] | tonumber? // "not a number: \(.)"'
input: '["42", "4x", "7"]'
caption: 'The ? operator and // give a fallback per value instead of stopping.'
expected: [42, "not a number: 4x", 7]
```

## Code points: explode and implode

[`explode`](https://jqlang.org/manual/v1.8/#explode) turns a string into an array of Unicode code
points (numbers), and [`implode`](https://jqlang.org/manual/v1.8/#implode) turns such an array
back into a string. This is the tool for anything character-level that the other functions do
not cover: reversing, shifting letters, or checking character ranges.

```jq-try
program: 'explode, (explode | reverse | implode)'
input: '"héllo"'
caption: The code points (233 is "é"), then the string reversed.
expected: [[104, 233, 108, 108, 111], "olléh"]
```

```jq-try
program: 'explode | map(if 97 <= . and . <= 122 then (. - 97 + 13) % 26 + 97 else . end) | implode'
input: '"hello, jq"'
caption: ROT13 on lowercase letters, done with code point arithmetic.
expected: ["uryyb, wd"]
```

Some older tutorials use an `ascii` function to turn a code point into a one-character string.
jq 1.8.2 does not define it; use `[n] | implode` instead.

```jq-try
program: 'implode, (.[] | [.] | implode)'
input: '[74, 81]'
caption: Two code points back to a string.
expected: ["JQ", "J", "Q"]
```

## Slicing strings

String slices `.[from:to]` count code points and work like array slices, including negative
positions from the end. A single index such as `.[0]` does not work on strings.

```jq-try
program: '.[:4], .[-4:], .[5:7]'
input: '"2026-03-16T10:00:07Z"'
caption: The year, the last four characters, and the month.
expected: ["2026", ":07Z", "03"]
```

```jq-try
program: '.[0]'
input: '"abc"'
caption: 'Common mistake: strings cannot be indexed by a number. Use .[0:1].'
error: 'Cannot index string'
```

## Splitting lines

With the `-R` (raw input) flag, jq reads text instead of JSON, and each line becomes one string
input. Add `-s` (slurp) to get the whole text as one string, then `split("\n")` yourself. A
trailing newline produces a final empty string, which you usually filter out.

```jq-try
program: 'split(",") | {name: .[0], age: .[1], city: .[2]}'
ref: static:people-csv
options: {raw_input: true}
caption: 'With -R each line is one input. The header line is just another line here.'
expected: [{"name": "name", "age": "age", "city": "city"}, {"name": "Astrid", "age": "41", "city": "Oslo"}, {"name": "Bjorn", "age": "29", "city": "Bergen"}, {"name": "Chiara", "age": "35", "city": "Milan"}, {"name": "Dmitri", "age": "47", "city": "Riga"}, {"name": "Efua", "age": "31", "city": "Accra"}, {"name": "Farid", "age": "26", "city": "Lyon"}]
```

```jq-try
program: 'split("\n") | map(select(length > 0)) | .[1:] | map(split(",")[0])'
ref: static:people-csv
options: {raw_input: true, slurp: true}
caption: 'With -R and -s the whole file is one string: split it, drop empty lines and the header.'
expected: [["Astrid", "Bjorn", "Chiara", "Dmitri", "Efua", "Farid"]]
```
