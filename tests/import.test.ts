import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { importAssets, importZip } from '../src/pack/import';

describe('Dub pack import', () => {
  it('imports a nested ZIP with multiple cues and backing audio', async () => {
    const zip = new JSZip();
    zip.file('Demo/dub_video.ogv', 'video');
    zip.file('Demo/_pack_info.ini', '[data]\ntitle="Demo"\nauthors=["Creator"]\nsubtitle="A test scene"\nicon="icon.png"');
    zip.file('Demo/icon.png', 'cover');
    zip.file('Demo/hello.ogg', 'audio');
    zip.file('Demo/hello.png', 'frame');
    zip.file('Demo/hello.txt', '[data]\ncaption="Hello!"\ndub_timestamps=[0.2, 1.4]\ndub_characters=["A", "B"]');
    zip.file('Demo/backing.ogg', 'music');
    const blob = await zip.generateAsync({ type: 'blob' });
    const file = new File([blob], 'demo.zip');
    const result = await importZip(file);
    expect(result.errors).toEqual([]);
    expect(result.pack?.name).toBe('Demo');
    expect(result.pack?.author).toBe('Creator');
    expect(result.pack?.subtitle).toBe('A test scene');
    expect(result.pack?.icon?.path).toBe('Demo/icon.png');
    expect(result.pack?.lines[0].image?.path).toBe('Demo/hello.png');
    expect(result.pack?.lines.map((line) => [line.startsAt, line.character])).toEqual([[0.2, 'A'], [1.4, 'B']]);
    expect(result.pack?.backingTrack?.path).toBe('Demo/backing.ogg');
  });
  it('reports missing video and malformed line timing', async () => {
    const result = await importAssets([
      { path: 'line.ogg', blob: new Blob(['audio']) },
      { path: 'line.txt', blob: new Blob(['[data]\ndub_timestamps=[wrong]']) },
    ]);
    expect(result.errors.join(' ')).toContain('dub_video.ogv');
    expect(result.errors.join(' ')).toContain('dub_timestamps');
  });
  it('ignores traversal paths', async () => {
    const result = await importAssets([{ path: '../dub_video.ogv', blob: new Blob(['bad']) }]);
    expect(result.errors.join(' ')).toContain('dub_video.ogv');
  });
});
