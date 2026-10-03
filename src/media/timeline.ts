import type { DubLine } from '../pack/types';

export function activeCaption(lines: DubLine[], time: number, durationFor: (line: DubLine) => number): DubLine | undefined {
  return [...lines].reverse().find((line) => time >= line.startsAt && time < line.startsAt + Math.max(0.75, durationFor(line)));
}

export function linesDue(lines: DubLine[], from: number, to: number): DubLine[] {
  return lines.filter((line) => line.startsAt > from && line.startsAt <= to);
}
