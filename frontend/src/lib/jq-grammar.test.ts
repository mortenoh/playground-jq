import { describe, expect, it } from 'vitest'

import { jqMonarch, wordAt } from '@/lib/jq-grammar'

describe('jqMonarch', () => {
    it('carries the builtins it is given', () => {
        const grammar = jqMonarch(['map', 'select'])
        expect(grammar.builtins).toEqual(['map', 'select'])
        expect(grammar.keywords).toContain('reduce')
    })

    it('tokenises paths, variables and formats with their own rules', () => {
        const rules = jqMonarch([]).tokenizer.root
        const matches = (text: string) =>
            rules.find((rule) => Array.isArray(rule) && rule[0] instanceof RegExp && rule[0].test(text))
        expect(matches('$name')?.[1]).toBe('variable.binding')
        expect(matches('@csv')?.[1]).toBe('keyword.format')
        expect(matches('# a comment')?.[1]).toBe('comment')
    })
})

describe('wordAt', () => {
    it('finds the identifier under a column', () => {
        expect(wordAt('.[] | select(.a)', 8)).toBe('select')
        expect(wordAt('$ENV.PAGER', 2)).toBe('$ENV')
        expect(wordAt('@base64d', 3)).toBe('@base64d')
        expect(wordAt('.a | .b', 4)).toBeNull()
    })
})
