---
title: Select, map and empty
summary: Filtering with select, transforming with map and map_values, how both are built on empty, and the mistakes people make with them.
level: 101
---

`select` and `map` are the two builtins you will use most. `select` keeps or drops values,
`map` transforms every element of an array. Both are short definitions in terms of what the
earlier chapters covered, and knowing those definitions explains how they behave in every
case, including the confusing ones.

## select

`select(f)` passes its input through unchanged if `f` is truthy for it, and produces nothing
otherwise. Its definition in jq is exactly that:

```
def select(f): if f then . else empty end;
```

It is used after an iterator, to keep some of the values in a stream:

```jq-try
program: '.[] | select(. > 2)'
input: '[1, 5, 2, 8, 3]'
caption: Only the values above 2 pass.
expected: [5, 8, 3]
```

```jq-try
program: '.store.books[] | select(.inStock == 0) | .title'
ref: static:bookstore
caption: The two sold-out books.
expected: ["JSON at Scale", "Data Wrangling Recipes"]
```

The condition can be any filter. Only its truthiness counts, so a field on its own tests
whether that field is present and neither `null` nor `false`:

```jq-try
program: '.[] | select(.email) | .username'
ref: static:users
caption: Users with an email address. ken's email is null, so he is left out.
expected: ["ada", "grace", "linus", "margaret", "barbara"]
```

See [select](https://jqlang.org/manual/v1.8/#select).

## select with several conditions

Combine conditions with `and` and `or` inside one `select`, or chain several `select`
filters, which is the same as joining them with `and`:

```jq-try
program: '.store.books[] | select(.price < 20 and .inStock > 0) | .title'
ref: static:bookstore
caption: Cheaper than 20 and in stock.
expected: ["Learning jq", "Pipes and Paths", "Functional Filters"]
```

```jq-try
program: '.store.books[] | select(.price < 20) | select(.inStock > 0) | .title'
ref: static:bookstore
caption: The same three books, with two selects in a row.
expected: ["Learning jq", "Pipes and Paths", "Functional Filters"]
```

```jq-try
program: '.[] | select(.status == "cancelled" or .status == "pending") | .id'
ref: static:orders
caption: Orders in either of two states.
expected: ["A-1003", "A-1004", "A-1007"]
```

For "one of these values", the `IN` builtin reads better than a chain of `or`:
`select(.status | IN("cancelled", "pending"))`.

A condition that looks inside an array needs care. Writing `.tags[] == "jq"` produces one
boolean per tag, and `select` passes its input once for *every* true result. Combined with
`or`, that easily duplicates items:

```jq-try
program: '.store.books[] | select(.tags[] == "jq" or .tags[] == "cli") | .title'
ref: static:bookstore
caption: 'A common mistake: Learning jq appears three times and The Art of the Shell twice.'
expected: ["Learning jq", "Learning jq", "Learning jq", "Pipes and Paths", "The Art of the Shell", "The Art of the Shell", "Functional Filters", "Streams and Generators"]
```

The fix is `any`, which reduces the generator to a single boolean (it is covered in more
detail later in the guide):

```jq-try
program: '.store.books[] | select(any(.tags[]; . == "jq" or . == "cli")) | .title'
ref: static:bookstore
caption: Each matching book once.
expected: ["Learning jq", "Pipes and Paths", "The Art of the Shell", "Functional Filters", "Streams and Generators"]
```

## select on the wrong level

`select` decides about its whole input. Applied to a container instead of the elements you
meant, it either fails or keeps and drops the whole container:

```jq-try
program: '.store.books | select(.price < 10)'
ref: static:bookstore
error: 'Cannot index array with string ("price")'
caption: 'A common mistake: the input to select is the array of books, which has no price.'
```

```jq-try
program: '.store | select(.books[].price < 10) | .name'
ref: static:bookstore
caption: 'Also wrong: select decides about the whole store, once for each book under 10, so the store passes twice.'
expected: ["The jq Bookshop", "The jq Bookshop"]
```

Put the iterator before `select`, so that `select` sees one element at a time, and write the
condition relative to that element: `.store.books[] | select(.price < 10)`.

## map

`map(f)` applies `f` to every element of an array and collects the results into a new
array. It is defined as:

```
def map(f): [.[] | f];
```

```jq-try
program: 'map(. * 10)'
input: '[1, 2, 3]'
caption: Every element multiplied.
expected: [[10, 20, 30]]
```

```jq-try
program: '.store.books | map({title, year})'
ref: static:bookstore
caption: A smaller object for every book, still in one array.
expected: [[{"title": "Learning jq", "year": 2021}, {"title": "JSON at Scale", "year": 2019}, {"title": "Pipes and Paths", "year": 2023}, {"title": "The Art of the Shell", "year": 2015}, {"title": "Functional Filters", "year": 2024}, {"title": "Data Wrangling Recipes", "year": 2020}, {"title": "Regular Expressions Unleashed", "year": 2018}, {"title": "Streams and Generators", "year": 2022}]]
```

Because the body is `[.[] | f]`, whatever `f` produces is collected: one output per element
keeps the length, no output removes the element, and several outputs add elements:

```jq-try
program: 'map(select(. > 2)), map(., .)'
input: '[1, 5, 2, 8]'
caption: select removes elements; a comma duplicates them.
expected: [[5, 8], [1, 1, 5, 5, 2, 2, 8, 8]]
```

`map(select(f))` is the array-to-array form of filtering. The result is an array, so it can
be counted, sorted or passed on as one value:

```jq-try
program: '.store.books | map(select(.inStock > 0)) | length'
ref: static:bookstore
caption: Six books are in stock.
expected: [6]
```

See [map and map_values](https://jqlang.org/manual/v1.8/#map-map_values).

## map over an object

`.[]` also iterates an object's values, so `map` accepts objects too. But the result is
always an array: the keys are thrown away.

```jq-try
program: 'map(. * 10)'
input: '{"a": 1, "b": 2}'
caption: 'A common mistake: map on an object gives an array of values, not an object.'
expected: [[10, 20]]
```

## map_values

`map_values(f)` applies `f` to every value of an object or array *in place*, keeping the
keys:

```jq-try
program: 'map_values(. * 10)'
input: '{"a": 1, "b": 2}'
caption: The keys are kept.
expected: [{"a": 10, "b": 20}]
```

It is defined as `.[] |= f`, an update assignment (covered later in the guide), and that
gives it two differences from `map`. If `f` produces no output for a value, the value is
removed. If `f` produces several outputs, only the first is used:

```jq-try
program: 'map_values(select(. != null)), map_values(. // 0)'
input: '{"a": 1, "b": null, "c": 3}'
caption: Drop the null field, or replace it with 0.
expected: [{"a": 1, "c": 3}, {"a": 1, "b": 0, "c": 3}]
```

```jq-try
program: 'map_values(., 100), map(., 100)'
input: '{"a": 1, "b": 2}'
caption: map_values keeps only the first output of f; map keeps them all.
expected: [{"a": 1, "b": 2}, [1, 100, 2, 100]]
```

```jq-try
program: '.store.location | map_values(ascii_downcase)'
ref: static:bookstore
caption: Lowercase every value of an object.
expected: [{"city": "oslo", "country": "no"}]
```

## empty, the common thread

`select` drops values by producing `empty`, `map` collects whatever its body produces, and
`map_values` deletes a value when its body is `empty`. You can use `empty` directly to the
same effect, for example to drop items in the middle of a larger expression:

```jq-try
program: 'map(if .qty == 0 then empty else {sku, total: (.qty * .price)} end)'
input: '[{"sku": "A", "qty": 2, "price": 3}, {"sku": "B", "qty": 0, "price": 5}, {"sku": "C", "qty": 1, "price": 4}]'
caption: Skipping zero quantities and transforming the rest in one step.
expected: [[{"sku": "A", "total": 6}, {"sku": "C", "total": 4}]]
```

## Putting them together

A typical query iterates, selects, and reshapes. Here, the items of shipped orders that cost
more than 10 each:

```jq-try
program: '[.[] | select(.status == "shipped") | .items[] | select(.price > 10) | {sku, title, price}]'
ref: static:orders
caption: Iterate the orders, keep the shipped ones, iterate their items, keep the expensive ones.
expected: [[{"sku": "BOOK-5", "title": "Functional Filters", "price": 19.99}, {"sku": "BOOK-7", "title": "Regular Expressions Unleashed", "price": 22}]]
```

The same query can be written with `map`, keeping arrays throughout. Which form to use is a
matter of taste; `.[] | ... ` produces a stream, `map(...)` keeps an array:

```jq-try
program: 'map(select(.status == "shipped") | .items | map(select(.price > 10))) | add | map({sku, title, price})'
ref: static:orders
caption: The same result built with map and add.
expected: [[{"sku": "BOOK-5", "title": "Functional Filters", "price": 19.99}, {"sku": "BOOK-7", "title": "Regular Expressions Unleashed", "price": 22}]]
```

With `select`, `map` and the construction and comparison tools from the earlier chapters, you
can already answer most questions about a JSON document. The following chapters add
variables, reduction, paths and more builtins.
