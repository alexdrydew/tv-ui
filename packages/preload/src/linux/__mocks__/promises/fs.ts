// This file might not be strictly necessary anymore if the direct vi.mock works,
// but keeping it doesn't hurt and provides an explicit mock implementation.
import { fs } from 'memfs';

export default fs.promises;
