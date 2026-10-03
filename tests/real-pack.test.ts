import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { importZip } from '../src/pack/import';

const packPath = process.env.WEBBY_REAL_PACK;

describe('creator pack compatibility', () => {
  (packPath ? it : it.skip)('imports the supplied Obsession Dub pack', async () => {
    const contents = await readFile(packPath!);
    const file = new File([new Uint8Array(contents)], 'obsession.zip');
    const result = await importZip(file);

    expect(result.errors).toEqual([]);
    expect(result.pack?.name).toBe('Obsession - Diner Scene');
    expect(result.pack?.author).toBe('Pothas');
    expect(result.pack?.subtitle).toBe("DON'T DO THAAAAT!!!");
    expect(result.pack?.icon?.path).toMatch(/icon\.png$/);
    expect(result.pack?.lines).toHaveLength(22);
    expect(result.pack?.lines.every((line) => line.image?.path.endsWith('.png'))).toBe(true);
    expect(new Set(result.pack?.lines.map((line) => line.character))).toEqual(new Set(['Nikki', 'Bear']));
    expect(result.pack?.lines[0].startsAt).toBe(0);
    expect(result.pack?.lines.at(-1)?.startsAt).toBe(72.505);
    expect(result.pack?.backingTrack?.path).toMatch(/_backing_track\.ogg$/);
  });
});
