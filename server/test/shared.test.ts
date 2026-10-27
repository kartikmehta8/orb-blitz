/**
 * @file Guards the shared-file contract: server copies must equal the app copies byte for byte.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url));

describe('shared files', () => {
  it.each(['intent.ts', 'fallbackParser.ts'])('server/src/%s equals app/src/%s', (name) => {
    expect(read(`../src/${name}`).equals(read(`../../app/src/${name}`))).toBe(true);
  });
});
