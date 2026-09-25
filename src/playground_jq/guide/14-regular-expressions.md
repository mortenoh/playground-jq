---
title: Regular expressions
summary: test, match, capture, scan, splits, sub and gsub, the flags that change them, and the Oniguruma syntax behind them.
level: 201
---

When `split`, `startswith` and `contains` are not enough, jq has regular expressions. They are
powered by the Oniguruma library using its Perl-compatible syntax, so patterns you know from
Perl, Python or JavaScript mostly work unchanged. See the manual's section on
[regular expressions](https://jqlang.org/manual/v1.8/#regular-expressions).

Every regex function takes the same shape of arguments: the input string, a pattern, and
optionally a string of flags, for example `test("jq"; "i")`. The functions differ in what they
return:

| Function | Returns |
|----------|---------|
| `test(re)` | `true` or `false` |
| `match(re)` | a match object per match (offset, length, string, captures) |
| `capture(re)` | an object of named groups per match |
| `scan(re)` | each matched string, or an array of its groups |
| `splits(re)` | the pieces between matches, as separate outputs |
| `sub(re; repl)` | the string with the first match replaced |
| `gsub(re; repl)` | the string with every match replaced |

## Backslashes: the first stumbling block

A pattern is an ordinary jq string, so jq's string escaping happens first. To pass `\d` to the
regex engine, write `"\\d"` in the program. A single backslash before a letter jq does not know
is a compile error. In the snippets below the programs are written for jq itself, so you see
the doubled backslashes exactly as you would type them.

```jq-try
program: 'test("\d")'
input: '"room 101"'
caption: 'Common mistake: \d is not a valid escape in a jq string.'
error: 'Invalid escape'
```

```jq-try
program: 'test("\\d"), test("^\\d+$")'
input: '"room 101"'
caption: 'Doubled backslashes reach the regex engine as \d. The anchored pattern fails: the string is not only digits.'
expected: [true, false]
```

## test: does it match?

[`test(re; flags)`](https://jqlang.org/manual/v1.8/#test) is the regex version of `contains`. It
answers yes or no, which makes it the usual partner of `select`.

```jq-try
program: '[.[] | select(.title | test("^(Add|Document)")) | .number]'
ref: static:github-issues
caption: Issues whose title starts with "Add" or "Document".
expected: [[102, 106, 108]]
```

```jq-try
program: '[.[] | select(.title | test("windows|segfault"; "i")) | .title]'
ref: static:github-issues
caption: Case-insensitive alternatives with the i flag.
expected: [["Segfault with deeply nested arrays", "Windows line endings in -R mode"]]
```

## match: where and what

[`match(re; flags)`](https://jqlang.org/manual/v1.8/#match) returns one object per match with
the `offset` (in code points), the `length`, the matched `string`, and a `captures` array with
the same fields plus `name` for each group. Without the `g` flag only the first match is
reported.

```jq-try
program: 'match("(\\d+)-(\\d+)")'
input: '"order A-1001 on 2026-03"'
caption: One match; each group has its own offset, length and string.
expected: [{"offset": 16, "length": 7, "string": "2026-03", "captures": [{"offset": 16, "length": 4, "string": "2026", "name": null}, {"offset": 21, "length": 2, "string": "03", "name": null}]}]
```

```jq-try
program: '[match("foo"; "g") | .offset]'
input: '"foo bar foo"'
caption: With g, every match; here only the offsets are kept.
expected: [[0, 8]]
```

A group that does not take part in the match is reported with `offset` -1 and `string` null.

```jq-try
program: 'match("(a)?x") | .captures'
input: '"x"'
caption: The optional group did not match.
expected: [[{"offset": -1, "string": null, "length": 0, "name": null}]]
```

## capture: named groups as an object

[`capture(re)`](https://jqlang.org/manual/v1.8/#capture) turns named groups, written
`(?<name>...)`, into an object. It is the quickest way to parse a structured string into
fields. Unnamed groups are ignored, and a named group that does not match gives `null`.

```jq-try
program: 'capture("(?<year>\\d{4})-(?<month>\\d{2})-(?<day>\\d{2})")'
input: '"2026-03-16"'
caption: A date string split into named parts.
expected: [{"year": "2026", "month": "03", "day": "16"}]
```

```jq-try
program: '.[:3] | map(.created_at | capture("(?<date>[^T]+)T(?<time>[^Z]+)Z"))'
ref: static:github-issues
caption: Date and time parts from the first three timestamps.
expected: [[{"date": "2026-01-03", "time": "09:15:00"}, {"date": "2026-01-05", "time": "14:02:00"}, {"date": "2026-01-11", "time": "11:45:00"}]]
```

## scan: every match

[`scan(re)`](https://jqlang.org/manual/v1.8/#scan) outputs each match. Without groups each
output is the matched string; with groups each output is an array of the group strings. Wrap it
in `[...]` to collect the results.

```jq-try
program: '[scan("\\d+")], [scan("(\\w+)=(\\w+)")]'
input: '"a=1; b=22; c=333"'
caption: 'Without groups: strings. With groups: one array per match.'
expected: [["1", "22", "333"], [["a", "1"], ["b", "22"], ["c", "333"]]]
```

```jq-try
program: '[scan("[A-Z][a-z]+")] | join("_") | ascii_downcase'
input: '"CamelCaseString"'
caption: Converting CamelCase to snake_case by scanning the words.
expected: ["camel_case_string"]
```

## splits: splitting on a pattern

[`splits(re)`](https://jqlang.org/manual/v1.8/#splits) is `split` with a regular expression. It
is a generator; wrap it in `[...]` for an array. `split(re; flags)` with two arguments is the
array-returning version. Note that the one-argument `split` is literal: `split(".")` splits on
dots, while `split("."; null)` treats the dot as "any character".

```jq-try
program: '[splits(" *[,;] *")]'
input: '"a, b;c ,d"'
caption: Commas or semicolons, with any spaces around them.
expected: [["a", "b", "c", "d"]]
```

```jq-try
program: 'split("."), split("."; null)'
input: '"a.b.c"'
caption: 'Common mistake: with flags, "." is a regex that matches every character.'
expected: [["a", "b", "c"], ["", "", "", "", "", ""]]
```

## sub and gsub: replacing

[`sub(re; replacement)`](https://jqlang.org/manual/v1.8/#sub) replaces the first match,
[`gsub(re; replacement)`](https://jqlang.org/manual/v1.8/#gsub) all of them. The replacement is
a jq expression, not a template string: it is evaluated with an object of the named captures
as its input. So `"\(.name)"` inside the replacement inserts the group called `name`, and you
can run any filter on it.

```jq-try
program: 'sub("o"; "0"), gsub("o"; "0")'
input: '"hello world"'
caption: First match versus every match.
expected: ["hell0 world", "hell0 w0rld"]
```

```jq-try
program: 'sub("(?<first>\\w+) (?<last>\\w+)"; "\(.last), \(.first)")'
input: '"Ada Lovelace"'
caption: Named captures rearranged in the replacement.
expected: ["Lovelace, Ada"]
```

```jq-try
program: 'gsub("(?<key>\\w+)-(?<n>\\d+)"; "\(.key | ascii_upcase)=\(.n | tonumber * 10)")'
input: '"x-1 y-2 z-3"'
caption: The replacement is a full jq expression over the captures.
expected: ["X=10 Y=20 Z=30"]
```

```jq-try
program: 'map(.title | gsub("[^A-Za-z0-9]+"; "-") | ascii_downcase | rtrimstr("-"))'
ref: static:github-issues
caption: URL slugs from issue titles.
expected: [["crash-when-input-is-empty", "add-tab-to-the-docs", "support-base32d", "bump-actions-checkout", "wrong-error-message-for-on-null", "document-limit-2-with-negative-numbers", "segfault-with-deeply-nested-arrays", "add-getpath-examples", "bump-pytest", "windows-line-endings-in-r-mode"]]
```

## Flags

The optional last argument is a string of single-letter flags. They can be combined, as in
`"gi"`.

| Flag | Meaning |
|------|---------|
| `g` | Global: all matches, not only the first |
| `i` | Case-insensitive |
| `x` | Extended: whitespace in the pattern is ignored and `#` starts a comment |
| `n` | Ignore empty matches |
| `s` | Single-line mode (`^` is `\A`, `$` is `\Z`) |
| `p` | Both `s` and multi-line mode, where `.` also matches a newline |
| `l` | Find the longest possible matches |

```jq-try
program: '[match("jq"; "gi") | .string]'
input: '"jq, JQ and Jq"'
caption: g and i together find all three spellings.
expected: [["jq", "JQ", "Jq"]]
```

```jq-try
program: 'capture("(?<year> \\d{4}) - (?<month> \\d{2})  # year, then month"; "x")'
input: '"2026-03"'
caption: The x flag lets you space out and comment a pattern.
expected: [{"year": "2026", "month": "03"}]
```

```jq-try
program: '[match("\\d*"; "g") | .string], [match("\\d*"; "gn") | .string]'
input: '"a1b"'
caption: '\d* also matches the empty string between letters; n drops those empty matches.'
expected: [["", "1", "", ""], ["1"]]
```

```jq-try
program: '[match("a|aa|aaa"; "g") | .string], [match("a|aa|aaa"; "gl") | .string]'
input: '"aaa"'
caption: The first alternative wins by default; l prefers the longest match.
expected: [["a", "a", "a"], ["aaa"]]
```

```jq-try
program: 'test("a.b"), test("a.b"; "p"), test("(?s)a.b")'
input: '"a\nb"'
caption: A dot does not match a newline unless you use p or the inline (?s).
expected: [false, true, true]
```

```jq-try
program: 'test("b"; "q")'
input: '"abc"'
caption: 'Common mistake: an unknown flag is an error.'
error: 'is not a valid modifier string'
```

## Oniguruma syntax notes

A few points that often matter:

- `^` and `$` anchor at the start and end of the whole string. Use the inline modifier `(?m)` to
  make them match at every line, as in `scan("(?m)^\\w+")`.
- Inline modifiers such as `(?i)`, `(?s)` and `(?m)` work at the start of a pattern or a group,
  as in Perl.
- `\w`, `\d` and `\s` are Unicode-aware: `\w` matches letters such as "ü".
- Offsets and lengths are counted in code points, like `length` on strings.
- Special characters are escaped with a backslash, which must itself be doubled in jq:
  `"a\\.b"` matches a literal dot.

```jq-try
program: '[scan("^\\w+")], [scan("(?m)^\\w+")]'
input: '"one\ntwo\nthree"'
caption: Without (?m), ^ only matches at the very start.
expected: [["one"], ["one", "two", "three"]]
```

```jq-try
program: 'test("^\\w+$"), (match("ber") | .offset)'
input: '"über"'
caption: \w covers the non-ASCII letter, and the offset counts code points.
expected: [true, 1]
```

```jq-try
program: 'test("(")'
input: '"foo"'
caption: 'Common mistake: an unbalanced parenthesis is a regex error at run time.'
error: 'unmatched parenthesis'
```
