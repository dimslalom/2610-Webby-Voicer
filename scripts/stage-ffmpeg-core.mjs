import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(root, 'node_modules/@ffmpeg/core/dist/esm');
const output = join(root, 'public/ffmpeg');
const workerSource = join(root, 'node_modules/@ffmpeg/ffmpeg/dist/esm');
const chunkSize = 20 * 1024 * 1024;
await mkdir(output, { recursive: true });
await copyFile(join(source, 'ffmpeg-core.js'), join(output, 'ffmpeg-core.js'));
await mkdir(join(output, 'worker'), { recursive: true });
for (const file of ['worker.js', 'const.js', 'errors.js']) await copyFile(join(workerSource, file), join(output, 'worker', file));
const wasm = await readFile(join(source, 'ffmpeg-core.wasm'));
for (let offset = 0, part = 0; offset < wasm.length; offset += chunkSize, part++) {
  await writeFile(join(output, `ffmpeg-core.wasm.part${part}`), wasm.subarray(offset, offset + chunkSize));
}
await writeFile(join(output, 'manifest.json'), JSON.stringify({ parts: Math.ceil(wasm.length / chunkSize), bytes: wasm.length }));
console.log(`Staged FFmpeg core in ${Math.ceil(wasm.length / chunkSize)} deployable parts.`);
