import { describe, it, expect } from 'vitest';
import { humanizeShape } from './index';

describe('humanizeShape', () => {
  it('sentence-cases a single-word kind', () => {
    expect(humanizeShape('server')).toBe('Server');
    expect(humanizeShape('decision')).toBe('Decision');
  });

  it('replaces hyphens with spaces and capitalises only the first word', () => {
    expect(humanizeShape('vector-store')).toBe('Vector store');
  });

  it('upper-cases acronym kinds (brand names / hardware acronyms)', () => {
    expect(humanizeShape('aws')).toBe('AWS');
    expect(humanizeShape('gcp')).toBe('GCP');
    expect(humanizeShape('gpu')).toBe('GPU');
  });
});
