export type MetadataValue = string | string[] | number[];

export function parseMetadata(source: string): Record<string, MetadataValue> {
  const result: Record<string, MetadataValue> = {};
  let inData = false;
  for (const raw of source.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith(';') || line.startsWith('#')) continue;
    if (/^\[.+\]$/.test(line)) {
      inData = line.toLowerCase() === '[data]';
      continue;
    }
    if (!inData) continue;
    const equals = line.indexOf('=');
    if (equals < 1) continue;
    const key = line.slice(0, equals).trim().toLowerCase();
    const value = line.slice(equals + 1).trim();
    if (value.startsWith('[') && value.endsWith(']')) {
      const items = splitList(value.slice(1, -1));
      if (key === 'dub_timestamps') {
        const numbers = items.map((item) => Number(item));
        if (numbers.every((number) => Number.isFinite(number) && number >= 0)) result[key] = numbers;
      } else result[key] = items;
    } else result[key] = unquote(value);
  }
  return result;
}

function splitList(input: string): string[] {
  const items: string[] = [];
  let value = '';
  let quoted = false;
  let escaped = false;
  for (const char of input) {
    if (escaped) { value += char; escaped = false; continue; }
    if (char === '\\' && quoted) { escaped = true; continue; }
    if (char === '"') { quoted = !quoted; value += char; continue; }
    if (char === ',' && !quoted) { items.push(unquote(value.trim())); value = ''; continue; }
    value += char;
  }
  if (quoted) return [];
  if (value.trim()) items.push(unquote(value.trim()));
  return items;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith('"') && trimmed.endsWith('"')
    ? trimmed.slice(1, -1).replace(/\\"/g, '"')
    : trimmed;
}

export function stringValue(value: MetadataValue | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
