import { describe, expect, it } from 'vitest'

import { hintFor } from '@/lib/hints'
import type { JqError } from '@/lib/types'

const error = (message: string, kind: JqError['kind'] = 'runtime'): JqError => ({
    kind,
    message,
    line: null,
    column: null,
    end_column: null,
})

describe('hintFor', () => {
    it('explains iterating over a missing path', () => {
        expect(hintFor(error('Cannot iterate over null (null)'))).toContain('does not exist')
    })

    it('explains indexing an array with a field name', () => {
        expect(hintFor(error('Cannot index array with "name"'))).toContain('map(.field)')
    })

    it('explains undefined names and timeouts', () => {
        expect(hintFor(error('foo/0 is not defined', 'compile'))).toContain('arity')
        expect(hintFor(error('stopped', 'timeout'))).toContain('limit')
    })

    it('says nothing for messages it does not know', () => {
        expect(hintFor(error('something unusual'))).toBeNull()
    })
})
