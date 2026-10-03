import { describe, expect, it } from 'vitest';
import { parseMetadata } from '../src/pack/metadata';

describe('legacy metadata', () => {
  it('reads strings, timestamps, and repeated roles from CRLF metadata', () => {
    expect(parseMetadata('[data]\r\ncaption="Wait, what?"\r\ndub_timestamps=[00.130, 1.500]\r\ndub_characters=["Mina", "Alex"]\r\n')).toEqual({
      caption: 'Wait, what?', dub_timestamps: [0.13, 1.5], dub_characters: ['Mina', 'Alex'],
    });
  });
  it('ignores other sections and invalid times', () => {
    expect(parseMetadata('[other]\ncaption="ignore"\n[data]\ndub_timestamps=[bad]\ncaption="Hello"')).toEqual({ caption: 'Hello' });
  });
});
