import JSZip from 'jszip';
import { parseMetadata, stringValue } from './metadata';
import type { DubLine, DubPack, PackAsset, PackImportResult } from './types';

const audioExt = /\.(ogg|oga|mp3|wav|m4a|webm)$/i;

export async function importZip(file: File): Promise<PackImportResult> {
  const zip = await JSZip.loadAsync(file);
  const entries: PackAsset[] = [];
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir || invalidPath(path)) continue;
    entries.push({ path, blob: await entry.async('blob') });
  }
  return importAssets(entries);
}

export async function importFolder(files: FileList | File[]): Promise<PackImportResult> {
  return importAssets(Array.from(files).map((file) => ({
    path: file.webkitRelativePath || file.name,
    blob: file,
  })));
}

export async function importAssets(assets: PackAsset[]): Promise<PackImportResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const safe = assets.filter((asset) => !invalidPath(asset.path));
  const video = safe.find((asset) => basename(asset.path).toLowerCase() === 'dub_video.ogv');
  if (!video) errors.push('Missing dub_video.ogv. Choose a Dub pack, not a voice-only pack.');

  const root = video ? video.path.slice(0, -'dub_video.ogv'.length) : '';
  const packFiles = safe.filter((asset) => asset.path.startsWith(root));
  const byName = new Map(packFiles.map((asset) => [asset.path.toLowerCase(), asset]));
  const info = packFiles.find((asset) => basename(asset.path).toLowerCase() === '_pack_info.ini');
  const infoData = info ? parseMetadata(await info.blob.text()) : {};
  const name = stringValue(infoData.name) || stringValue(infoData.title) || root.split('/').filter(Boolean).at(-1) || 'Untitled pack';
  const authors = infoData.authors;
  const author = stringValue(infoData.author) || (Array.isArray(authors) ? authors.join(', ') : undefined) || stringValue(infoData.creator) || 'Unknown creator';
  const subtitle = stringValue(infoData.subtitle);
  const iconName = stringValue(infoData.icon);
  const icon = iconName ? byName.get(`${root}${iconName}`.toLowerCase()) : undefined;

  const lines: DubLine[] = [];
  for (const asset of packFiles) {
    if (!audioExt.test(asset.path) || /(?:backing|instrumental|background|music)/i.test(basename(asset.path))) continue;
    const metaPath = asset.path.replace(audioExt, '.txt');
    const metadata = byName.get(metaPath.toLowerCase()) || byName.get(metaPath.replace(/\.txt$/i, '.ini').toLowerCase());
    if (!metadata) continue;
    const data = parseMetadata(await metadata.blob.text());
    const timestamps = data.dub_timestamps;
    const characters = data.dub_characters;
    if (!Array.isArray(timestamps) || !timestamps.every((value) => typeof value === 'number') || !timestamps.length) {
      errors.push(`${metadata.path}: missing or invalid dub_timestamps.`);
      continue;
    }
    const characterNames = Array.isArray(characters) ? characters.map(String) : [];
    const caption = stringValue(data.caption) || basename(asset.path).replace(audioExt, '').replace(/[_-]/g, ' ');
    const image = byName.get(asset.path.replace(audioExt, '.png').toLowerCase());
    timestamps.forEach((startsAt, index) => lines.push({
      id: `${asset.path}:${index}`,
      character: characterNames[index] || characterNames[0] || 'Unknown character',
      caption,
      startsAt,
      original: asset,
      image,
      metadataPath: metadata.path,
    }));
  }
  lines.sort((a, b) => a.startsAt - b.startsAt || a.id.localeCompare(b.id));
  if (!lines.length) errors.push('No Dub lines found. Each line needs an audio file and matching .txt or .ini metadata with dub_timestamps.');
  if (!info) warnings.push('No _pack_info.ini found; creator name may be unavailable.');
  const backingTrack = packFiles.find((asset) => audioExt.test(asset.path) && /(?:backing|instrumental|background|music)/i.test(basename(asset.path)));
  if (!backingTrack) warnings.push('No backing track found. The original video audio may still contain voices during scene playback.');
  if (errors.length || !video) return { errors };
  const pack: DubPack = { name, author, subtitle, icon, video, backingTrack, lines, warnings };
  return { pack, errors: [] };
}

function basename(path: string): string { return path.split('/').at(-1) || ''; }
function invalidPath(path: string): boolean {
  return path.startsWith('/') || path.includes('\\') || path.split('/').some((part) => part === '..' || part === '');
}
