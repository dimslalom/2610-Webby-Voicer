export type RecordingSession = {
  stream: MediaStream;
  stop: () => Promise<Blob>;
  cancel: () => void;
};

function audioMime(): string | undefined {
  return ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find((mime) => MediaRecorder.isTypeSupported(mime));
}

export async function startLineRecording(): Promise<RecordingSession> {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    throw new Error('This browser cannot record a microphone. Use a recent browser over HTTPS or localhost.');
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const mimeType = audioMime();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
  recorder.start();
  const release = () => stream.getTracks().forEach((track) => track.stop());
  return {
    stream,
    stop: () => new Promise<Blob>((resolve, reject) => {
      recorder.onerror = () => { release(); reject(new Error('The microphone recording failed.')); };
      recorder.onstop = () => {
        release();
        const result = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' });
        if (result.size) resolve(result);
        else reject(new Error('The microphone did not capture any sound.'));
      };
      recorder.stop();
    }),
    cancel: () => { if (recorder.state !== 'inactive') recorder.stop(); release(); },
  };
}
