---
title: Identity and fields
summary: The identity filter, field access with .foo and .["key"], nested paths, optional access, and what missing keys and null give.
level: 101
---

Most jq programs start by reaching into their input for a particular value. This chapter
covers the filters that do that for objects: the identity `.`, field access, and the
optional forms that suppress errors. Arrays get the same treatment in the next chapter,
*Arrays and slices*.

## The identity: .

`.` is the filter that produces its input unchanged. On its own it pretty-prints a
document, which is the most common first use of jq (`curl ... | jq .`):

```jq-try
program: '.'
input: '{"name":"jq","tags":["json","cli"],"stable":true}'
caption: The identity reformats compact JSON with indentation.
expected: [{"name": "jq", "tags": ["json", "cli"], "stable": true}]
```

It matters more as a building block. Inside a larger program `.` always means "the current
input at this point", which changes as values flow through pipes. See
[Identity](https://jqlang.org/manual/v1.8/#identity).

## Field access: .foo

`.foo` produces the value of key `foo` in an object:

```jq-try
program: '.name'
input: '{"name": "jq", "version": "1.8"}'
caption: The value of one key.
expected: ["jq"]
```

Paths are chained by writing them one after another. `.store.location.city` goes three
levels down:

```jq-try
program: '.store.location.city'
ref: static:bookstore
caption: Three field accesses in a row.
expected: ["Oslo"]
```

`.a.b` is shorthand for `.a | .b`: take `.a`, then take `.b` of the result. Both forms
give the same output:

```jq-try
program: '.store.location | .country'
ref: static:bookstore
caption: The same path written with an explicit pipe.
expected: ["NO"]
```

The manual calls this the
[object identifier-index](https://jqlang.org/manual/v1.8/#object-identifier-index).

## Keys that are not identifiers

`.foo` only works when the key looks like an identifier: letters, digits and underscores,
not starting with a digit. For any other key, quote it: `."first-name"`, `."a b"`,
`."$id"`.

```jq-try
program: '."first-name"'
input: '{"first-name": "Ada", "last name": "Lovelace"}'
caption: A quoted key after the dot.
expected: ["Ada"]
```

```jq-try
program: '.first-name'
input: '{"first-name": "Ada", "last name": "Lovelace"}'
error: 'name/0 is not defined'
caption: 'A common mistake: without quotes, jq reads .first - name, and name is not a function.'
```

The general form is `.["key"]`, with the key as a string in brackets. It works with any
key and can be chained like the dotted form:

```jq-try
program: '.["last name"], .["first-name"]'
input: '{"first-name": "Ada", "last name": "Lovelace"}'
caption: Bracket syntax, for any key.
expected: ["Lovelace", "Ada"]
```

```jq-try
program: '.store["location"]["city"]'
ref: static:bookstore
caption: Brackets chained after a field.
expected: ["Oslo"]
```

The expression inside the brackets can be any filter that produces a string, which lets a
program choose the key at run time. Note that the expression is evaluated against the same
input as the whole `.[...]`:

```jq-try
program: '.[.pick]'
input: '{"pick": "b", "a": 1, "b": 2}'
caption: The key comes from the data itself; .pick is "b", so this is .["b"].
expected: [2]
```

See [object index](https://jqlang.org/manual/v1.8/#object-index) in the manual.

## Missing keys give null

Asking for a key that does not exist is not an error. It gives `null`:

```jq-try
program: '.store.manager'
ref: static:bookstore
caption: There is no manager key, so the result is null.
expected: [null]
```

Indexing `null` is also not an error, and gives `null` again. That means a whole path of
missing keys quietly becomes `null`, however deep it goes:

```jq-try
program: '.store.manager.name.first'
ref: static:bookstore
caption: .manager is null, and every further step on null gives null.
expected: [null]
```

This is convenient, because optional data does not need defensive checks at every level.
It also means a typo in a key name gives `null` instead of an error, so an unexpected `null`
in your output is usually a misspelled or misplaced key.

```jq-try
program: '.[] | .preferences.theme'
ref: static:users
caption: margaret has no preferences key, so her theme is null rather than an error.
expected: ["dark", "light", "dark", null, "dark", "light"]
```

To replace such nulls with a default, use the alternative operator `//`, covered in
*Operators*: `.preferences.theme // "default"`.

## Indexing the wrong type is an error

Field access is defined for objects and for `null`. On any other type it is an error, which
is jq's way of saying the data does not have the shape the program expects:

```jq-try
program: '.name.first'
input: '{"name": "Ada Lovelace"}'
error: 'Cannot index string with string ("first")'
caption: .name is a string, and a string has no fields.
```

```jq-try
program: '.store.books.title'
ref: static:bookstore
error: 'Cannot index array with string ("title")'
caption: 'A common mistake: books is an array. Use .store.books[].title to visit each book.'
```

## Optional access: .foo?

Adding `?` after a field access suppresses the error when the input is of the wrong type.
Instead of failing, the expression produces no output at all (not `null`):

```jq-try
program: '.name.first?'
input: '{"name": "Ada Lovelace"}'
caption: The error is suppressed, and there is no output.
expected: []
```

This is useful when the values being visited have mixed shapes and you only care about the
ones that fit:

```jq-try
program: '[.[] | .name?]'
input: '[{"name": "a"}, "plain string", {"name": "b"}, 42, {"other": 1}]'
caption: The string and the number produce nothing; the object without name gives null.
expected: [["a", "b", null]]
```

`?` only hides errors from the expression it is attached to. It does not turn a missing key
into anything other than `null`, because a missing key was never an error. See
[optional object identifier-index](https://jqlang.org/manual/v1.8/#optional-object-identifier-index);
the general form of error suppression, `try`, has its own chapter later in the guide.

## Summary

| Form | Meaning |
| --- | --- |
| `.` | The input itself. |
| `.foo`, `.foo.bar` | A field, and a field of a field. |
| `."foo-bar"`, `.["foo-bar"]` | A field whose name is not an identifier. |
| `.[expr]` | A field whose name is computed. |
| `.foo?` | A field, with no output instead of an error on a non-object. |
| missing key, or any key of `null` | `null` |
