import type { DubPack } from '../pack/types';

export async function canPlayPackVideo(pack: DubPack): Promise<boolean> {
  const url = URL.createObjectURL(pack.video.blob);
  const video = document.createElement('video');
  video.preload = 'metadata';
  video.src = url;
  const result = await new Promise<boolean>((resolve) => {
    let finished = false;
    const finish = (value: boolean) => { if (finished) return; finished = true; clearTimeout(timeout); video.onloadedmetadata = null; video.onerror = null; video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url); resolve(value); };
    const timeout = setTimeout(() => finish(false), 6000);
    video.onloadedmetadata = () => finish(true);
    video.onerror = () => finish(false);
  });
  return result;
}

export async function convertPackVideo(pack: DubPack, onProgress: (percent: number) => void, onStatus: (message: string) => void = () => {}): Promise<DubPack> {
  const { FFmpeg } = await import('@ffmpeg/ffmpeg');
  const { fetchFile } = await import('@ffmpeg/util');
  const ffmpeg = new FFmpeg();
  let wasmUrl = '';
  ffmpeg.on('progress', ({ progress }) => onProgress(Math.max(0, Math.min(99, Math.round(progress * 100)))));
  try {
    onProgress(0);
    onStatus('Downloading video converter to this device…');
    const manifest = await fetch('/ffmpeg/manifest.json').then((response) => response.json()) as { parts: number; bytes: number };
    if (!Number.isInteger(manifest.parts) || manifest.parts < 1 || manifest.parts > 8) throw new Error('Video converter is unavailable.');
    const chunks = await Promise.all(Array.from({ length: manifest.parts }, (_, index) => fetchWithTimeout(`/ffmpeg/ffmpeg-core.wasm.part${index}`, 60_000).then((response) => {
      if (!response.ok) throw new Error('Could not load the video converter.');
      return response.arrayBuffer();
    })));
    if (chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0) !== manifest.bytes) throw new Error('The video converter download was incomplete.');
    wasmUrl = URL.createObjectURL(new Blob(chunks, { type: 'application/wasm' }));
    onStatus('Starting video converter…');
    await Promise.race([ffmpeg.load({
      classWorkerURL: `${location.origin}/ffmpeg/worker/worker.js`,
      coreURL: `${location.origin}/ffmpeg/ffmpeg-core.js`,
      wasmURL: wasmUrl,
    }), new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Video converter did not start on this device.')), 90_000))]);
    onStatus('Converting OGV video…');
    await ffmpeg.writeFile('scene.ogv', await fetchFile(pack.video.blob));
    const exit = await ffmpeg.exec(['-i', 'scene.ogv', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', 'scene.mp4'], 300_000);
    if (exit !== 0) throw new Error('Could not convert this OGV video. The pack may be damaged or too large for this device.');
    const bytes = await ffmpeg.readFile('scene.mp4');
    if (typeof bytes === 'string') throw new Error('Video conversion returned invalid data.');
    const blob = new Blob([new Uint8Array(bytes).buffer], { type: 'video/mp4' });
    if (!blob.size) throw new Error('Video conversion produced an empty file.');
    onProgress(100);
    return { ...pack, video: { path: 'scene.mp4', blob } };
  } finally {
    ffmpeg.terminate();
    if (wasmUrl) URL.revokeObjectURL(wasmUrl);
  }
}

async function fetchWithTimeout(url: string, milliseconds: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), milliseconds);
  try { return await fetch(url, { signal: controller.signal }); }
  finally { clearTimeout(timeout); }
}
