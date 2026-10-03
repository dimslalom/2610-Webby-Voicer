import type { DubLine, DubPack } from '../pack/types';
import { activeCaption, linesDue } from './timeline';

export type SceneHandle = { stop: () => void; done: Promise<Blob | undefined> };

export async function playScene(
  pack: DubPack,
  takes: Map<string, Blob>,
  canvas: HTMLCanvasElement,
  exportVideo: boolean,
): Promise<SceneHandle> {
  const videoUrl = URL.createObjectURL(pack.video.blob);
  const video = document.createElement('video');
  video.src = videoUrl;
  video.playsInline = true;
  video.preload = 'auto';
  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error('This browser cannot play this video. Try converting the pack video, then play the scene again.'));
  }).catch((error) => { URL.revokeObjectURL(videoUrl); throw error; });

  const width = Math.min(1280, video.videoWidth || 640);
  const height = Math.round(width * (video.videoHeight || 360) / (video.videoWidth || 640));
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) { URL.revokeObjectURL(videoUrl); throw new Error('Canvas rendering is unavailable.'); }
  const audio = new AudioContext();
  await audio.resume();
  const destination = audio.createMediaStreamDestination();
  const source = audio.createMediaElementSource(video);
  source.connect(destination);
  if (!exportVideo) source.connect(audio.destination);
  video.muted = false;
  video.volume = pack.backingTrack ? 0 : 1;
  const clipUrls: string[] = [];
  const playingClips: HTMLAudioElement[] = [];
  const durations = new Map<string, number>();
  const decoded = new Map<string, AudioBuffer>();
  const lineAsset = (line: DubLine) => takes.get(line.id) || line.original.blob;
  for (const line of pack.lines) {
    const blob = lineAsset(line);
    const key = line.id;
    try {
      const buffer = await audio.decodeAudioData(await blob.arrayBuffer());
      decoded.set(key, buffer);
      durations.set(key, buffer.duration);
    } catch {
      throw new Error(`Cannot decode audio for ${line.character}: ${line.caption}`);
    }
  }
  let backing: HTMLAudioElement | undefined;
  if (pack.backingTrack) {
    const url = URL.createObjectURL(pack.backingTrack.blob);
    clipUrls.push(url);
    backing = new Audio(url);
    const backingSource = audio.createMediaElementSource(backing);
    backingSource.connect(destination);
    if (!exportVideo) backingSource.connect(audio.destination);
  }
  const playLine = (line: DubLine) => {
    const buffer = decoded.get(line.id);
    if (!buffer) return;
    const player = audio.createBufferSource();
    player.buffer = buffer;
    player.connect(destination);
    if (!exportVideo) player.connect(audio.destination);
    player.start();
  };
  let frame = 0;
  let previous = -0.02;
  let ended = false;
  let recorder: MediaRecorder | undefined;
  let resolveDone!: (value: Blob | undefined) => void;
  let rejectDone!: (reason: Error) => void;
  const done = new Promise<Blob | undefined>((resolve, reject) => { resolveDone = resolve; rejectDone = reject; });
  const release = () => {
    if (ended) return;
    ended = true;
    cancelAnimationFrame(frame);
    video.pause();
    backing?.pause();
    playingClips.forEach((clip) => clip.pause());
    URL.revokeObjectURL(videoUrl);
    clipUrls.forEach(URL.revokeObjectURL);
    void audio.close();
  };
  const draw = () => {
    if (ended) return;
    const now = video.currentTime;
    ctx.drawImage(video, 0, 0, width, height);
    for (const line of linesDue(pack.lines, previous, now)) playLine(line);
    previous = now;
    const caption = activeCaption(pack.lines, now, (line) => durations.get(line.id) || 1);
    if (caption) {
      const text = `${caption.character}: ${caption.caption}`;
      ctx.font = `600 ${Math.max(18, Math.round(width / 34))}px system-ui`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(0,0,0,.9)';
      ctx.fillStyle = 'white';
      const pieces = wrapText(ctx, text, width * .88);
      pieces.forEach((piece, index) => {
        const y = height - 28 - (pieces.length - 1 - index) * Math.max(26, width / 27);
        ctx.strokeText(piece, width / 2, y);
        ctx.fillText(piece, width / 2, y);
      });
    }
    if (now > Math.max(0, video.duration - 3)) {
      ctx.font = `500 ${Math.max(13, Math.round(width / 55))}px system-ui`;
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(255,255,255,.92)';
      ctx.fillText(`Pack by ${pack.author} · Webby Voicer`, width - 14, 24);
    }
    frame = requestAnimationFrame(draw);
  };
  if (exportVideo) {
    if (!canvas.captureStream || typeof MediaRecorder === 'undefined') {
      release(); throw new Error('This browser cannot export video from the scene canvas.');
    }
    const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/mp4'].find((item) => MediaRecorder.isTypeSupported(item));
    if (!mime) { release(); throw new Error('This browser has no supported video export format.'); }
    const stream = canvas.captureStream(30);
    destination.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
    const chunks: BlobPart[] = [];
    recorder = new MediaRecorder(stream, { mimeType: mime });
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    recorder.onerror = () => { release(); rejectDone(new Error('Video export failed.')); };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mime });
      release();
      blob.size ? resolveDone(blob) : rejectDone(new Error('The exported video was empty.'));
    };
    recorder.start(1000);
  }
  video.onended = () => {
    if (recorder?.state === 'recording') recorder.stop();
    else { release(); resolveDone(undefined); }
  };
  try {
    await video.play();
    await backing?.play();
    draw();
  } catch {
    release();
    throw new Error('The browser could not start scene playback. Check the pack video and audio.');
  }
  return { stop: () => {
    if (recorder?.state === 'recording') recorder.stop();
    else { release(); resolveDone(undefined); }
  }, done };
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of text.split(/\s+/)) {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && current) { lines.push(current); current = word; }
    else current = next;
  }
  if (current) lines.push(current);
  return lines.slice(-3);
}
