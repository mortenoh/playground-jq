/**
 * jq as the editor tokenises it, kept free of Monaco so it can be tested in Node.
 *
 * Ported from dirigent's `CodeEditor.tsx` grammar: a path and a variable are what a jq program
 * is mostly made of, so each is a token of its own, and an interpolation inside a string is
 * the program again, which is why the string state re-enters `@root`. Here `@format` strings
 * and `?//` are tokens too, and the builtin list comes from the server's catalogue at runtime.
 */

/** Everything that is syntax rather than a function. */
export const JQ_KEYWORDS = [
    'def',
    'if',
    'then',
    'elif',
    'else',
    'end',
    'as',
    'reduce',
    'foreach',
    'try',
    'catch',
    'label',
    'import',
    'include',
    'and',
    'or',
    'not',
    '__loc__',
]

/** Builtins known before the catalogue has loaded; the catalogue extends this at runtime. */
export const JQ_BUILTINS_FALLBACK = [
    'map',
    'map_values',
    'select',
    'empty',
    'error',
    'length',
    'keys',
    'keys_unsorted',
    'values',
    'has',
    'in',
    'to_entries',
    'from_entries',
    'with_entries',
    'add',
    'any',
    'all',
    'flatten',
    'range',
    'tostring',
    'tonumber',
    'type',
    'sort',
    'sort_by',
    'group_by',
    'unique',
    'unique_by',
    'min_by',
    'max_by',
    'reverse',
    'contains',
    'split',
    'join',
    'test',
    'match',
    'capture',
    'sub',
    'gsub',
    'paths',
    'getpath',
    'setpath',
    'delpaths',
    'del',
    'first',
    'last',
    'limit',
    'until',
    'recurse',
    'env',
    'input',
    'inputs',
    'debug',
    'tojson',
    'fromjson',
    'todate',
    'fromdate',
    'now',
]

/** The Monarch grammar, parameterised by the builtin names. */
export function jqMonarch(builtins: string[]) {
    return {
        defaultToken: '',
        keywords: JQ_KEYWORDS,
        builtins,
        tokenizer: {
            root: [
                [/#.*$/, 'comment'],
                [/"/, { token: 'string', next: '@string' }],
                [/@[a-z0-9]+/, 'keyword.format'],
                [/\$__loc__/, 'variable.binding'],
                [/\$[A-Za-z_]\w*/, 'variable.binding'],
                [/\.\./, 'keyword'],
                [/\.[A-Za-z_]\w*/, 'type'],
                [/\.(?=\[)/, 'type'],
                [/\."/, { token: 'type', next: '@string' }],
                [
                    /[A-Za-z_]\w*/,
                    {
                        cases: {
                            '@keywords': 'keyword',
                            '@builtins': 'predefined',
                            '@default': 'identifier',
                        },
                    },
                ],
                [/\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/, 'number'],
                [/[{}()[\]]/, '@brackets'],
                [/\?\/\/|\|=|\/\/=?|==|!=|<=|>=|\+=|-=|\*=|\/=|%=|[-+*/%<>=]/, 'operator'],
                [/[|,;:?]/, 'delimiter'],
            ],
            string: [
                [/\\\(/, { token: 'delimiter', next: '@interpolation' }],
                [/\\./, 'string.escape'],
                [/[^\\"]+/, 'string'],
                [/"/, { token: 'string', next: '@pop' }],
            ],
            interpolation: [[/\)/, { token: 'delimiter', next: '@pop' }], { include: '@root' }],
        },
    }
}

/** The word at a column of a line, for hover lookups: identifiers, `$vars`, `@formats`. */
export function wordAt(line: string, column: number): string | null {
    const pattern = /[$@]?[A-Za-z_][A-Za-z0-9_]*/g
    for (const match of line.matchAll(pattern)) {
        const start = match.index + 1
        const end = start + match[0].length
        if (column >= start && column <= end) return match[0]
    }
    return null
}
