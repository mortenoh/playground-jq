---
title: Dates and times
summary: Converting between ISO 8601 strings, Unix timestamps and broken-down time, formatting, date arithmetic, and grouping by day or month.
level: 201
---

JSON has no date type. Dates travel as strings, usually ISO 8601 like `"2026-03-16T10:00:07Z"`,
or as numbers of seconds since 1970 (Unix timestamps). jq's date functions convert between three
representations:

| Representation | Example | Good for |
|----------------|---------|----------|
| ISO 8601 string | `"2026-03-16T10:00:07Z"` | storage, sorting, reading |
| Unix timestamp | `1773655207` | arithmetic: differences, adding days |
| broken-down time | `[2026, 2, 16, 10, 0, 7, 1, 74]` | picking out parts, formatting |

The broken-down time is an array of year, month (counted from 0, so 2 is March), day of month,
hours, minutes, seconds, day of the week (0 is Sunday) and day of the year (counted from 0). All
of these functions work in UTC unless their name says "local". The manual section is
[dates](https://jqlang.org/manual/v1.8/#dates).

The examples use fixed timestamps. jq also has `now`, the current time as a timestamp, but its
output changes on every run, so it does not appear here.

## fromdate and todate

[`fromdate`](https://jqlang.org/manual/v1.8/#dates) parses an ISO 8601 string into a Unix
timestamp; `todate` goes the other way. They are short names for `fromdateiso8601` and
`todateiso8601`.

```jq-try
program: 'fromdate, fromdateiso8601'
input: '"2026-03-16T10:00:07Z"'
caption: The same timestamp from both names.
expected: [1773655207, 1773655207]
```

```jq-try
program: 'todate, todateiso8601, (0 | todate)'
input: '1773655207'
caption: Back to ISO 8601, and the Unix epoch itself.
expected: ["2026-03-16T10:00:07Z", "2026-03-16T10:00:07Z", "1970-01-01T00:00:00Z"]
```

`fromdate` accepts exactly one shape: `YYYY-MM-DDTHH:MM:SSZ`. Fractional seconds, a time zone
offset, or a date without a time all fail.

```jq-try
program: '.[] | fromdate'
input: '["2026-03-16T10:00:07Z", "2026-03-16T10:00:07.123Z"]'
caption: 'Common mistake: fromdate rejects fractional seconds.'
expected: [1773655207]
error: 'does not match format'
```

A common fix is to cut the string down to the part `fromdate` understands, or to parse it with an
explicit format (next section).

```jq-try
program: '.[] | .[:19] + "Z" | fromdate | todate'
input: '["2026-03-16T10:00:07.123Z", "2026-03-16T10:00:07.9Z"]'
caption: Dropping the fractional part before parsing (this ignores any time zone offset).
expected: ["2026-03-16T10:00:07Z", "2026-03-16T10:00:07Z"]
```

## strptime and mktime

[`strptime(format)`](https://jqlang.org/manual/v1.8/#dates) parses a string with a C-style
format into broken-down time. [`mktime`](https://jqlang.org/manual/v1.8/#dates) turns
broken-down time into a Unix timestamp. Together they read dates in any fixed layout.

| Directive | Meaning |
|-----------|---------|
| `%Y` | four-digit year |
| `%m` | month, 01 to 12 |
| `%d` | day of month, 01 to 31 |
| `%H`, `%M`, `%S` | hours, minutes, seconds |
| `%j` | day of year, 001 to 366 |
| `%A`, `%a` | weekday name, full and short |
| `%B`, `%b` | month name, full and short |
| `%V` | ISO 8601 week number |
| `%u` | ISO weekday, 1 (Monday) to 7 |

```jq-try
program: 'strptime("%Y-%m-%dT%H:%M:%SZ"), (strptime("%Y-%m-%dT%H:%M:%SZ") | mktime)'
input: '"2026-03-16T10:00:07Z"'
caption: Broken-down time (month 2 is March, weekday 1 is Monday), then the timestamp.
expected: [[2026, 2, 16, 10, 0, 7, 1, 74], 1773655207]
```

```jq-try
program: 'strptime("%d/%m/%Y") | mktime | todate'
input: '"16/03/2026"'
caption: A European date without a time becomes midnight UTC.
expected: ["2026-03-16T00:00:00Z"]
```

## gmtime and strftime

[`gmtime`](https://jqlang.org/manual/v1.8/#dates) is the reverse of `mktime`: it breaks a
timestamp into its parts. Fractional seconds are kept in the seconds field.
[`strftime(format)`](https://jqlang.org/manual/v1.8/#dates) formats either a timestamp or a
broken-down time as a string, with the same directives as `strptime`.

```jq-try
program: 'gmtime, (gmtime | mktime)'
input: '1773655207.25'
caption: The parts, with 7.25 seconds; mktime drops the fraction on the way back.
expected: [[2026, 2, 16, 10, 0, 7.25, 1, 74], 1773655207]
```

```jq-try
program: 'strftime("%Y-%m-%d %H:%M"), strftime("%A, %d %B %Y"), strftime("day %j, week %V")'
input: '1773655207'
caption: The same moment in three layouts.
expected: ["2026-03-16 10:00", "Monday, 16 March 2026", "day 075, week 12"]
```

```jq-try
program: '.[] | {number, opened: (.created_at | fromdate | strftime("%a %d %b"))}'
ref: static:github-issues
caption: Friendlier dates for each issue.
expected: [{"number": 101, "opened": "Sat 03 Jan"}, {"number": 102, "opened": "Mon 05 Jan"}, {"number": 103, "opened": "Sun 11 Jan"}, {"number": 104, "opened": "Mon 12 Jan"}, {"number": 105, "opened": "Tue 20 Jan"}, {"number": 106, "opened": "Sun 01 Feb"}, {"number": 107, "opened": "Tue 03 Feb"}, {"number": 108, "opened": "Tue 10 Feb"}, {"number": 109, "opened": "Sun 15 Feb"}, {"number": 110, "opened": "Sat 21 Feb"}]
```

## Local time

`localtime` and `strflocaltime` are the local-time versions of `gmtime` and `strftime`: they
apply the time zone of the machine that runs jq. The same program gives different answers in
Oslo and in New York, which is exactly what you want for a report printed on your own machine,
and exactly what you do not want in a shared script. Prefer the UTC functions and convert for
display at the very end. Because their output depends on where they run, this guide does not
show them as runnable snippets.

## Date arithmetic in seconds

Arithmetic happens on timestamps, in seconds. A minute is 60, an hour 3600, a day 86400. Convert
to a timestamp, add or subtract, and convert back.

```jq-try
program: 'fromdate | (. + 86400 * 7 | todate), (. - 3600 | todate)'
input: '"2026-03-16T10:00:07Z"'
caption: One week later, and one hour earlier.
expected: ["2026-03-23T10:00:07Z", "2026-03-16T09:00:07Z"]
```

```jq-try
program: '[.[] | select(.closed_at) | {number, hours: ((.closed_at | fromdate) - (.created_at | fromdate)) / 3600}]'
ref: static:github-issues
caption: How long each closed issue stayed open, in hours.
expected: [[{"number": 102, "hours": 18.466666666666665}, {"number": 104, "hours": 7.083333333333333}, {"number": 106, "hours": 314}, {"number": 108, "hours": 24}]]
```

```jq-try
program: 'map(select(.closed_at) | (.closed_at | fromdate) - (.created_at | fromdate)) | add / length / 86400 | . * 100 | round / 100'
ref: static:github-issues
caption: The average time to close, in days, rounded to two decimals.
expected: [3.79]
```

Truncating a timestamp to the start of its day is a modulo away, since every UTC day has 86400
seconds.

```jq-try
program: 'fromdate | . - (. % 86400) | todate'
input: '"2026-03-16T10:00:07Z"'
caption: Midnight at the start of the same day.
expected: ["2026-03-16T00:00:00Z"]
```

## Comparing and filtering dates

ISO 8601 strings in the same format and time zone sort in time order, so they can be compared
directly as strings. That is often simpler than converting.

```jq-try
program: '[.[] | select(.created_at >= "2026-02-01" and .created_at < "2026-02-15") | .number]'
ref: static:github-issues
caption: Issues opened in the first half of February, by string comparison.
expected: [[106, 107, 108]]
```

```jq-try
program: '[.[] | select((.created_at | fromdate) > ("2026-03-08T00:00:00Z" | fromdate)) | .id]'
ref: static:orders
caption: 'The same kind of filter on timestamps, the form to use once the boundary is computed (a date minus seven days, say).'
expected: [["A-1006", "A-1007", "A-1008"]]
```

## Grouping by day or month

Grouping needs a key. For an ISO string, a slice is the cheapest key: `.[:7]` is the month and
`.[:10]` the day. For anything the string does not spell out, such as the weekday or the week
number, go through `fromdate` and `strftime`.

```jq-try
program: 'group_by(.created_at[:7]) | map({month: .[0].created_at[:7], opened: length})'
ref: static:github-issues
caption: Issues opened per month.
expected: [[{"month": "2026-01", "opened": 5}, {"month": "2026-02", "opened": 5}]]
```

```jq-try
program: 'group_by(.created_at[:10]) | map({day: .[0].created_at[:10], orders: length}) | .[:4]'
ref: static:orders
caption: Orders per calendar day (the first four days).
expected: [[{"day": "2026-03-01", "orders": 1}, {"day": "2026-03-02", "orders": 1}, {"day": "2026-03-04", "orders": 1}, {"day": "2026-03-05", "orders": 1}]]
```

```jq-try
program: 'map(. + {week: (.created_at | fromdate | strftime("%V"))}) | group_by(.week) | map({week: .[0].week, orders: length, revenue: add(.[].items[] | .qty * .price)})'
ref: static:orders
caption: Orders and revenue per ISO week.
expected: [[{"week": "09", "orders": 1, "revenue": 26}, {"week": "10", "orders": 4, "revenue": 149.12}, {"week": "11", "orders": 3, "revenue": 103.25}]]
```

```jq-try
program: 'group_by(.created_at | fromdate | strftime("%u")) | map({weekday: (.[0].created_at | fromdate | strftime("%A")), orders: length})'
ref: static:orders
caption: 'Orders per weekday. %u gives Monday first; %A alone would sort the names alphabetically.'
expected: [[{"weekday": "Monday", "orders": 2}, {"weekday": "Tuesday", "orders": 1}, {"weekday": "Wednesday", "orders": 1}, {"weekday": "Thursday", "orders": 2}, {"weekday": "Saturday", "orders": 1}, {"weekday": "Sunday", "orders": 1}]]
```
