import { useEffect, useRef, useState } from 'react';

type Decoded = { duration: number; bins: { low: number; high: number }[] };
type Moment = { time: number; low: number; high: number };
type Props = {
  original: Blob;
  take?: Blob;
  stream?: MediaStream;
  recording?: boolean;
  canPlay?: boolean;
  cursor?: number | null;
  playing?: 'original' | 'take';
  onPlayOriginal: () => void;
  onPlayTake: () => void;
};

async function decode(blob: Blob): Promise<Decoded> {
  const context = new AudioContext();
  try {
    const audio = await context.decodeAudioData(await blob.arrayBuffer());
    const bins = Array.from({ length: 2048 }, () => ({ low: 0, high: 0 }));
    for (let channelIndex = 0; channelIndex < audio.numberOfChannels; channelIndex++) {
      const channel = audio.getChannelData(channelIndex);
      for (let sample = 0; sample < channel.length; sample++) {
        const bin = bins[Math.min(bins.length - 1, Math.floor(sample / channel.length * bins.length))];
        bin.low = Math.min(bin.low, channel[sample]);
        bin.high = Math.max(bin.high, channel[sample]);
      }
    }
    return { bins, duration: audio.duration };
  } finally {
    await context.close();
  }
}

function envelope(audio: Decoded, count: number, duration: number): { low: number; high: number }[] {
  const result = Array.from({ length: count }, () => ({ low: 0, high: 0 }));
  for (let index = 0; index < count; index++) {
    const startTime = index * duration / count;
    if (startTime >= audio.duration) continue;
    const endTime = Math.min(audio.duration, (index + 1) * duration / count);
    const start = Math.floor(startTime / audio.duration * audio.bins.length);
    const end = Math.min(audio.bins.length, Math.max(start + 1, Math.ceil(endTime / audio.duration * audio.bins.length)));
    for (let bin = start; bin < end; bin++) {
      result[index].low = Math.min(result[index].low, audio.bins[bin].low);
      result[index].high = Math.max(result[index].high, audio.bins[bin].high);
    }
  }
  return result;
}

function clock(seconds: number): string {
  if (seconds < 10) return seconds.toFixed(1) + 's';
  return Math.floor(seconds / 60) + ':' + String(Math.floor(seconds % 60)).padStart(2, '0');
}

function gainFor(values: { low: number; high: number }[]): number {
  let peak = 0;
  for (const value of values) peak = Math.max(peak, -value.low, value.high);
  return 0.8 / Math.max(peak, 0.02);
}

export default function Waveform({ original, take, stream, recording = false, canPlay = true, cursor = null, playing, onPlayOriginal, onPlayTake }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [reference, setReference] = useState<Decoded>();
  const [recorded, setRecorded] = useState<Decoded>();
  const [elapsed, setElapsed] = useState(0);
  const live = useRef<Moment[]>([]);
  const started = useRef(0);

  useEffect(() => {
    let cancelled = false;
    setReference(undefined);
    void decode(original).then((audio) => { if (!cancelled) setReference(audio); }).catch(() => {});
    return () => { cancelled = true; };
  }, [original]);
  useEffect(() => {
    let cancelled = false;
    setRecorded(undefined);
    if (take) void decode(take).then((audio) => { if (!cancelled) setRecorded(audio); }).catch(() => {});
    return () => { cancelled = true; };
  }, [take]);

  useEffect(() => {
    if (!stream || !recording) return;
    const context = new AudioContext();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    let frame = 0;
    started.current = performance.now();
    live.current = [];
    let lastDrawn = 0;
    const capture = () => {
      analyser.getFloatTimeDomainData(samples);
      let low = 0;
      let high = 0;
      for (let index = 0; index < samples.length; index++) {
        low = Math.min(low, samples[index]);
        high = Math.max(high, samples[index]);
      }
      const time = (performance.now() - started.current) / 1000;
      live.current.push({ time, low, high });
      if (time - lastDrawn >= 1 / 30) { setElapsed(time); lastDrawn = time; }
      frame = requestAnimationFrame(capture);
    };
    capture();
    return () => { cancelAnimationFrame(frame); source.disconnect(); void context.close(); };
  }, [stream, recording]);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const context = element.getContext('2d');
    if (!context) return;
    const draw = () => {
      const box = element.getBoundingClientRect();
      const scale = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.floor(box.width * scale));
      const height = Math.max(1, Math.floor(box.height * scale));
      if (element.width !== width || element.height !== height) { element.width = width; element.height = height; }
      context.clearRect(0, 0, width, height);
      const duration = Math.max(reference?.duration || 0, recorded?.duration || 0, recording ? elapsed : 0, 0.1);
      const count = Math.max(1, Math.ceil(width / 2));
      const middle = height / 2;
      context.strokeStyle = '#dfe4ed';
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(0, middle);
      context.lineTo(width, middle);
      context.stroke();
      const render = (values: { low: number; high: number }[], color: string, lineWidth: number, gain: number) => {
        context.strokeStyle = color;
        context.lineWidth = lineWidth;
        context.beginPath();
        for (let index = 0; index < values.length; index++) {
          const x = (index + .5) * width / values.length;
          context.moveTo(x, middle - Math.min(1, values[index].high * gain) * height * .45);
          context.lineTo(x, middle - Math.max(-1, values[index].low * gain) * height * .45);
        }
        context.stroke();
      };
      if (reference) render(envelope(reference, count, duration), '#636a76a8', Math.max(1, scale * 1.3), gainFor(reference.bins));
      if (recording && live.current.length) {
        const points = Array.from({ length: count }, () => ({ low: 0, high: 0 }));
        for (const moment of live.current) {
          const index = Math.min(count - 1, Math.floor(moment.time / duration * count));
          points[index].low = Math.min(points[index].low, moment.low);
          points[index].high = Math.max(points[index].high, moment.high);
        }
        render(points, '#2869ebd9', Math.max(1, scale * 1.7), gainFor(points));
      } else if (recorded) render(envelope(recorded, count, duration), '#2869ebd9', Math.max(1, scale * 1.7), gainFor(recorded.bins));
      if (cursor !== null) {
        const x = Math.min(width, Math.max(0, cursor / duration * width));
        context.strokeStyle = '#eb7059';
        context.lineWidth = Math.max(1, scale);
        context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke();
      }
    };
    const observer = new ResizeObserver(draw);
    observer.observe(element);
    draw();
    return () => observer.disconnect();
  }, [reference, recorded, recording, elapsed, cursor]);

  const duration = Math.max(reference?.duration || 0, recorded?.duration || 0, recording ? elapsed : 0);
  return <div className="compare-waveform">
    <div className="compare-head"><strong>Compare timing <small>· traces scaled</small></strong><div className="compare-legend"><span><i className="legend-original"/> Original</span><span><i className="legend-take"/> Your audio</span></div></div>
    <canvas ref={canvas} className="compare-canvas" role="img" aria-label="Original and recorded audio waveforms overlaid on the same time axis; each trace is scaled to show detail"/>
    <div className="compare-ticks"><span>0s</span><span>{clock(duration / 2)}</span><span>{clock(duration)}</span></div>
    <div className="compare-players"><button className="button secondary" title="Plays original audio with the matching video clip" disabled={recording || !canPlay} onClick={onPlayOriginal}>{playing === 'original' ? '■ Pause original' : '▶ Play original'}</button><button className="button secondary" title="Plays your take with the matching video clip" disabled={recording || !take || !canPlay} onClick={onPlayTake}>{playing === 'take' ? '■ Pause your take' : take ? '▶ Play your take' : 'Record to compare'}</button></div>
  </div>;
}
