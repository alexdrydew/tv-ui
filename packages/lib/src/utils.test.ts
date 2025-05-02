import { describe, expect, it } from 'vitest';

import { dropDuplicates } from './utils.js';

describe('dropDuplicates', () => {
    it('should remove duplicate objects based on a specified key', () => {
        const input = [
            { id: 1, name: 'Alice' },
            { id: 2, name: 'Bob' },
            { id: 1, name: 'Charlie' },
            { id: 3, name: 'David' },
            { id: 2, name: 'Eve' },
        ];
        const expected = [
            { id: 1, name: 'Alice' },
            { id: 2, name: 'Bob' },
            { id: 3, name: 'David' },
        ];
        const result = dropDuplicates(input, 'id');
        expect(result).toEqual(expected);
    });
});
