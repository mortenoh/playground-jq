---
title: Formats and escaping
summary: The @format filters for CSV, TSV, HTML, URLs, shell and Base64, formats inside string interpolation, and tojson/fromjson.
level: 201
---

jq's output is JSON, but the thing you are feeding is often not: a spreadsheet wants CSV, a web
page wants escaped HTML, a shell script wants safely quoted words, a URL wants percent-encoding.
The `@name` format filters convert a value into a string in one of these formats, escaping
whatever needs escaping. The manual covers them under
[format strings and escaping](https://jqlang.org/manual/v1.8/#format-strings-and-escaping).

Formats produce strings. In a terminal you almost always combine them with `-r` (raw output) so
that the string is printed as it is, without JSON quotes. The snippets here set `raw_output`
where it matters; the recorded output is still shown as JSON strings.

| Format | Input | Produces |
|--------|-------|----------|
| `@text` | anything | the same as `tostring` |
| `@json` | anything | the value as JSON text |
| `@csv` | array of scalars | one CSV row, strings quoted |
| `@tsv` | array of scalars | one TSV row, special characters escaped |
| `@html` | anything | text with `<>&'"` as HTML entities |
| `@uri` | anything | percent-encoded text |
| `@urid` | string | percent-decoded text (new in 1.8) |
| `@sh` | scalar or array of scalars | single-quoted shell words |
| `@base64` | anything | Base64 of the text |
| `@base64d` | string | the decoded text |

## @text and @json

`@text` is `tostring`: strings pass through, other values become their JSON text. `@json` always
encodes, so a string gets quotes and escapes. The difference shows most clearly on a string.

```jq-try
program: '(.s | @text, @json), (.o | @text, @json)'
input: '{"s": "say \"hi\"", "o": {"a": [1, 2]}}'
caption: 'On a string @json adds quotes and escapes; on an object both give the same JSON text.'
expected: ["say \"hi\"", "\"say \\\"hi\\\"\"", "{\"a\":[1,2]}", "{\"a\":[1,2]}"]
```

## @csv and @tsv

`@csv` turns an array into one comma-separated row. Numbers and booleans are written as they
are, `null` becomes an empty field, and strings are always wrapped in double quotes with inner
quotes doubled. `@tsv` separates with tabs and escapes tabs, newlines, carriage returns and
backslashes instead of quoting.

```jq-try
program: '@csv'
input: '[1, "a,b", "say \"hi\"", null, true]'
options: {raw_output: true}
caption: 'Strings quoted, the inner quotes doubled, null as an empty field.'
expected: ["1,\"a,b\",\"say \"\"hi\"\"\",,true"]
```

```jq-try
program: '@tsv'
input: '["a\tb", "line\nbreak", "C:\\temp", 3]'
options: {raw_output: true}
caption: 'Tabs, newlines and backslashes become \t, \n and \\ so each row stays on one line.'
expected: ["a\\tb\tline\\nbreak\tC:\\\\temp\t3"]
```

Both expect a flat array. Nested arrays and objects have no CSV form.

```jq-try
program: '@csv'
input: '[1, [2, 3]]'
caption: 'Common mistake: a nested array cannot be a CSV field.'
error: 'is not valid in a csv row'
```

```jq-try
program: '@csv'
input: '{"a": 1}'
caption: 'Common mistake: @csv needs an array, not an object. Pick the fields first.'
error: 'cannot be csv-formatted, only array'
```

## Building CSV from objects

The usual recipe is: output a header row, then one row per object with the fields in a fixed
order. Listing the fields once in an array keeps header and rows in step.

```jq-try
program: '["title", "author", "price"] as $cols | ($cols | @csv), (.store.books[:3][] | [.[$cols[]]] | @csv)'
ref: static:bookstore
options: {raw_output: true}
caption: A header and three rows; [.[$cols[]]] looks up each column in order.
expected: ["\"title\",\"author\",\"price\"", "\"Learning jq\",\"Ada Filter\",8.5", "\"JSON at Scale\",\"Ben Stream\",24.0", "\"Pipes and Paths\",\"Cleo Reduce\",6.25"]
```

```jq-try
program: '(.[0] | keys_unsorted | @tsv), (.[] | [.[]] | @tsv)'
input: '[{"name": "Astrid", "team": "platform", "age": 41}, {"name": "Bjorn", "team": "platform", "age": 29}]'
options: {raw_output: true}
caption: TSV with the header taken from the first object's keys.
expected: ["name\tteam\tage", "Astrid\tplatform\t41", "Bjorn\tplatform\t29"]
```

```jq-try
program: '.[] | [.id, .customer.name, .status, (.items | length), .coupon] | @csv'
ref: static:orders
options: {raw_output: true}
caption: 'One CSV line per order, with nested fields flattened. The null coupons become empty fields.'
expected: ["\"A-1001\",\"Ada Lovelace\",\"shipped\",2,\"SPRING10\"", "\"A-1002\",\"Grace Hopper\",\"delivered\",1,", "\"A-1003\",\"Ada Lovelace\",\"cancelled\",1,", "\"A-1004\",\"Linus T\",\"pending\",3,\"WELCOME\"", "\"A-1005\",\"Margaret H\",\"shipped\",1,", "\"A-1006\",\"Grace Hopper\",\"delivered\",2,\"SPRING10\"", "\"A-1007\",\"Ken Thompson\",\"pending\",1,", "\"A-1008\",\"Linus T\",\"shipped\",2,"]
```

## @html

`@html` replaces `<`, `>`, `&`, `'` and `"` with entities, so text from data can be placed in a
page without being read as markup.

```jq-try
program: '@html'
input: '"<a href=\"x\">Tom & ''Jerry''</a>"'
caption: All five special characters escaped.
expected: ["&lt;a href=&quot;x&quot;&gt;Tom &amp; &apos;Jerry&apos;&lt;/a&gt;"]
```

## @uri and @urid

`@uri` percent-encodes every byte that is not an unreserved URL character (letters, digits and
`-_.~`), which is right for a query parameter or a path segment. jq 1.8 adds `@urid`, which
decodes.

```jq-try
program: '@uri, (@uri | @urid)'
input: '"a b&c=d/é"'
caption: Spaces, reserved characters and UTF-8 bytes encoded, then decoded back.
expected: ["a%20b%26c%3Dd%2F%C3%A9", "a b&c=d/é"]
```

## @sh

`@sh` quotes a value so a POSIX shell reads it as one word. A string is wrapped in single quotes,
with any single quote inside written as `'\''`. An array becomes several quoted words separated
by spaces, which is handy for building argument lists.

```jq-try
program: '@sh'
input: '["a file.txt", "it''s", 3]'
options: {raw_output: true}
caption: Three shell words; the embedded quote is closed, escaped and reopened.
expected: ["'a file.txt' 'it'\\''s' 3"]
```

```jq-try
program: '@sh'
input: '[1, {"a": 1}]'
caption: 'Common mistake: objects cannot be shell-quoted.'
error: 'can not be escaped for shell'
```

## @base64 and @base64d

`@base64` encodes the UTF-8 bytes of the text; `@base64d` decodes it back to a string. Encoded
tokens and data URIs are the common reason to reach for them.

```jq-try
program: '@base64, (@base64 | @base64d)'
input: '"héllo jq"'
caption: Encoded and decoded again.
expected: ["aMOpbGxvIGpx", "héllo jq"]
```

```jq-try
program: '.token | split(".")[1] | @base64d | fromjson'
input: '{"token": "eyJhbGciOiJub25lIn0.eyJzdWIiOiJhZGEiLCJyb2xlIjoiYWRtaW4ifQ."}'
caption: 'Reading the payload of an unsigned JWT: base64 decode, then parse the JSON.'
expected: [{"sub": "ada", "role": "admin"}]
```

## Formats inside string interpolation

A format can prefix a string literal: `@uri "...\(x)..."`. The literal text is kept as it is and
only the interpolated values are formatted. This is the safe way to assemble URLs, HTML
fragments and shell commands, because you cannot forget to escape one of the pieces.

```jq-try
program: '@uri "https://example.org/search?q=\(.q)&page=\(.page)"'
input: '{"q": "jq & json", "page": 2}'
caption: 'The ? = & in the template stay; the value "jq & json" is encoded.'
expected: ["https://example.org/search?q=jq%20%26%20json&page=2"]
```

```jq-try
program: '@html "<li>\(.title) <em>\(.author)</em></li>"'
input: '{"title": "Pipes & <Paths>", "author": "Cleo Reduce"}'
caption: Markup from the template, escaped text from the data.
expected: ["<li>Pipes &amp; &lt;Paths&gt; <em>Cleo Reduce</em></li>"]
```

```jq-try
program: '.store.books[:2][] | @sh "curl -d \(.title) https://example.org/books"'
ref: static:bookstore
options: {raw_output: true}
caption: Shell commands with each title quoted as one argument.
expected: ["curl -d 'Learning jq' https://example.org/books", "curl -d 'JSON at Scale' https://example.org/books"]
```

## tojson and fromjson

[`tojson`](https://jqlang.org/manual/v1.8/#convert-to-from-json) is the function form of `@json`: it
serialises any value to a JSON string. `fromjson` parses a string of JSON back into a value.
You need `fromjson` whenever an API embeds JSON as a string inside JSON, and `tojson` when a
field must hold JSON text.

```jq-try
program: '.payload | fromjson | .items | add'
input: '{"payload": "{\"items\": [1, 2, 3]}"}'
caption: A JSON document stored as a string, parsed and used.
expected: [6]
```

```jq-try
program: '.settings |= tojson'
input: '{"id": 7, "settings": {"theme": "dark", "size": 12}}'
caption: Storing a nested object as a JSON string field.
expected: [{"id": 7, "settings": "{\"theme\":\"dark\",\"size\":12}"}]
```

```jq-try
program: 'fromjson'
input: '"[1, 2"'
caption: 'Common mistake: fromjson fails on text that is not complete JSON.'
error: 'Unfinished JSON term'
```
