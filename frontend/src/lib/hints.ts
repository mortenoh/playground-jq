/**
 * Plain-language hints for the jq errors learners meet most, shown under the error itself.
 * Each pattern matches jq 1.8's own message text.
 */

import type { JqError } from '@/lib/types'

const HINTS: { pattern: RegExp; hint: string }[] = [
    {
        pattern: /^Cannot iterate over null/,
        hint: 'The value before `[]`, `map` or `.[]` is null: that path does not exist in this input. Check the field names against the input, or use `.[]?` to skip missing values.',
    },
    {
        pattern: /^Cannot iterate over (string|number|boolean)/,
        hint: 'Only arrays and objects can be iterated. Check what the path before `[]` really is with `type`.',
    },
    {
        pattern: /^Cannot index (array|number|string|boolean) with "/,
        hint: 'A field name was used on something that is not an object. If it is an array, iterate first: `.[].field` or `map(.field)`.',
    },
    {
        pattern: /^Cannot index object with number/,
        hint: 'Objects are indexed by key, not position. Use `.key`, `to_entries`, or `keys[0]`.',
    },
    {
        pattern: /cannot be added|cannot be subtracted|cannot be multiplied|cannot be divided/,
        hint: 'The operands have types that do not combine. Convert first, for example `tonumber` on a string, or `tostring` before joining.',
    },
    {
        pattern: /is not defined/,
        hint: 'jq does not know this name. Check the spelling and the number of arguments (`name/arity`); a variable needs `$`.',
    },
    {
        pattern: /syntax error/,
        hint: 'jq could not parse the program. Look for an unbalanced bracket, a missing `|`, or a string that needs double quotes.',
    },
    {
        pattern: /^parse error/,
        hint: 'The input is not valid JSON. If it is plain text or CSV, turn on `-R` (raw input).',
    },
    {
        pattern: /cannot be matched, as it is not a string/,
        hint: 'Regular expression functions need a string input. Select strings first, or convert with `tostring`.',
    },
    {
        pattern: /Cannot parse .* as JSON|Cannot use .* as object key/,
        hint: 'Object keys must be strings. Convert a number with `tostring` before using it as a key.',
    },
]

export function hintFor(error: JqError): string | null {
    if (error.kind === 'timeout')
        return 'The program ran too long; an infinite recursion or `repeat` without `limit` is the usual cause.'
    return HINTS.find(({ pattern }) => pattern.test(error.message))?.hint ?? null
}
