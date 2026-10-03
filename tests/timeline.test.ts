import { describe, expect, it } from 'vitest';
import { activeCaption, linesDue } from '../src/media/timeline';
import type { DubLine } from '../src/pack/types';

const asset = { path: 'a.ogg', blob: new Blob() };
const lines: DubLine[] = [
  { id: 'a', character: 'A', caption: 'First', startsAt: 0.2, original: asset, metadataPath: 'a.txt' },
  { id: 'b', character: 'B', caption: 'Second', startsAt: 1.2, original: asset, metadataPath: 'b.txt' },
];

describe('scene timing', () => {
  it('triggers cues once as playback crosses their start', () => {
    expect(linesDue(lines, -0.02, 0.3).map((line) => line.id)).toEqual(['a']);
    expect(linesDue(lines, 0.3, 1.3).map((line) => line.id)).toEqual(['b']);
  });
  it('shows the latest active caption when lines overlap', () => {
    expect(activeCaption(lines, 1.3, () => 2)?.id).toBe('b');
    expect(activeCaption(lines, 4, () => 1)).toBeUndefined();
  });
});
