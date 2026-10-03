import { useEffect, useRef, useState } from 'react';
import { importFolder, importZip } from './pack/import';
import type { DubPack } from './pack/types';
import { startLineRecording, type RecordingSession } from './media/recording';
import { playScene, type SceneHandle } from './media/render';
import Room from './room/Room';
import { zipFolder } from './pack/share';
import Marketplace from './market/Marketplace';
import { canPlayPackVideo, convertPackVideo } from './media/compatibility';
import Waveform from './media/Waveform';
import { useLinePlayback } from './media/useLinePlayback';

type Take = { blob: Blob; url: string };

export default function App() {
  const [pack, setPack] = useState<DubPack>();
  const [shareZip, setShareZip] = useState<Blob>();
  const [joinCode, setJoinCode] = useState('');
  const [roomMode, setRoomMode] = useState<{ kind: 'create' | 'join'; code?: string } | undefined>(() => {
    const code = new URLSearchParams(location.search).get('room');
    return code && /^[A-Z2-9]{6}$/.test(code) ? { kind: 'join', code } : undefined;
  });
  const [marketOpen, setMarketOpen] = useState(false);
  const [screen, setScreen] = useState<'start' | 'ready' | 'solo'>('start');
  const [videoCompatibility, setVideoCompatibility] = useState<'checking' | 'ready' | 'unsupported' | 'converting'>('checking');
  const [convertProgress, setConvertProgress] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(0);
  const [takes, setTakes] = useState<Map<string, Take>>(new Map());
  const [recording, setRecording] = useState(false);
  const [recordingStream, setRecordingStream] = useState<MediaStream>();
  const [sceneMode, setSceneMode] = useState<'preview' | 'export'>();
  const [message, setMessage] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [originalUrl, setOriginalUrl] = useState('');
  const [packIconUrl, setPackIconUrl] = useState('');
  const [lineImageUrl, setLineImageUrl] = useState('');
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const recorder = useRef<RecordingSession | undefined>(undefined);
  const scene = useRef<SceneHandle | undefined>(undefined);
  const takesRef = useRef(takes);
  const canvas = useRef<HTMLCanvasElement>(null);
  const zipInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const readyVideo = useRef<HTMLVideoElement>(null);
  const [readyPlaying, setReadyPlaying] = useState(false);
  const activeLine = pack?.lines[selected];
  const playback = useLinePlayback(activeLine?.startsAt || 0, originalUrl, activeLine ? takes.get(activeLine.id)?.url : undefined);
  useEffect(() => { if (screen !== 'ready') setReadyPlaying(false); }, [screen]);

  useEffect(() => {
    const input = folderInput.current;
    if (input) input.setAttribute('webkitdirectory', '');
  }, []);
  useEffect(() => {
    if (!pack) return;
    const url = URL.createObjectURL(pack.video.blob);
    setVideoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pack]);
  useEffect(() => {
    if (!pack) return;
    let cancelled = false;
    setVideoCompatibility('checking');
    void canPlayPackVideo(pack).then(async (supported) => {
      if (cancelled) return;
      if (supported) { setVideoCompatibility('ready'); return; }
      setVideoCompatibility('converting'); setConvertProgress(0);
      try {
        const converted = await convertPackVideo(pack, (progress) => { if (!cancelled) setConvertProgress(progress); }, () => {});
        if (!cancelled) { setPack(converted); setVideoCompatibility('ready'); }
      } catch (error) {
        if (!cancelled) { setVideoCompatibility('unsupported'); setMessage(error instanceof Error ? error.message : 'Video preparation failed.'); }
      }
    }).catch((error) => { if (!cancelled) { setVideoCompatibility('unsupported'); setMessage(String(error)); } });
    return () => { cancelled = true; };
  }, [pack]);
  useEffect(() => {
    const line = pack?.lines[selected];
    if (!line) return;
    const url = URL.createObjectURL(line.original.blob);
    setOriginalUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pack, selected]);
  useEffect(() => {
    if (!pack?.icon) { setPackIconUrl(''); return; }
    const url = URL.createObjectURL(pack.icon.blob);
    setPackIconUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pack]);
  useEffect(() => {
    const image = pack?.lines[selected]?.image;
    if (!image) { setLineImageUrl(''); return; }
    const url = URL.createObjectURL(image.blob);
    setLineImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pack, selected]);
  useEffect(() => { takesRef.current = takes; }, [takes]);
  useEffect(() => { if (!message) return; const timer = window.setTimeout(() => setMessage(''), 3500); return () => clearTimeout(timer); }, [message]);
  useEffect(() => () => {
    recorder.current?.cancel();
    scene.current?.stop();
    takesRef.current.forEach((take) => URL.revokeObjectURL(take.url));
  }, []);

  const load = async (kind: 'zip' | 'folder', files: FileList | File[] | null) => {
    if (!files?.length) return;
    setBusy(true); setErrors([]); setMessage('Reading pack…');
    recorder.current?.cancel(); scene.current?.stop(); playback.stop(); setRecordingStream(undefined); setRecording(false);
    try {
      const result = kind === 'zip' ? await importZip(files[0]) : await importFolder(files);
      if (result.errors.length) { setErrors(result.errors); setMessage(''); }
      else if (result.pack) {
        const readyZip = kind === 'zip' ? files[0] : await zipFolder(files);
        setTakes((old) => { old.forEach((take) => URL.revokeObjectURL(take.url)); return new Map(); });
        setPack(result.pack); setShareZip(readyZip); setSelected(0); setVideoDuration(null); setScreen('ready'); setMessage(`${result.pack.lines.length} lines ready.`);
      }
    } catch (error) {
      setErrors([error instanceof Error ? error.message : 'Could not open this pack.']); setMessage('');
    } finally { setBusy(false); }
  };
  const tryDemo = async () => {
    try {
      const response = await fetch('/demo-pack.zip');
      if (!response.ok) throw new Error('Demo pack is unavailable.');
      const file = new File([await response.blob()], 'demo-pack.zip', { type: 'application/zip' });
      await load('zip', [file]);
    } catch (error) { setErrors([error instanceof Error ? error.message : 'Could not load the demo pack.']); }
  };
  const line = pack?.lines[selected];
  const start = async () => {
    playback.stop();
    try { recorder.current = await startLineRecording(); setRecordingStream(recorder.current.stream); setRecording(true); setMessage('Recording this line…'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Microphone unavailable.'); }
  };
  const stop = async () => {
    if (!recorder.current || !line) return;
    try {
      const blob = await recorder.current.stop();
      const url = URL.createObjectURL(blob);
      setTakes((old) => {
        const next = new Map(old);
        const previous = next.get(line.id);
        if (previous) URL.revokeObjectURL(previous.url);
        next.set(line.id, { blob, url });
        return next;
      });
      setMessage('Take saved on this device. Listen or retake it.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Recording failed.'); }
    finally { recorder.current = undefined; setRecordingStream(undefined); setRecording(false); }
  };
  const runScene = async (mode: 'preview' | 'export') => {
    if (!pack || !canvas.current) return;
    scene.current?.stop(); playback.stop();
    setSceneMode(mode); setMessage(mode === 'export' ? 'Rendering your video in real time…' : 'Playing your scene…');
    try {
      const selectedTakes = new Map(Array.from(takes, ([id, take]) => [id, take.blob]));
      const handle = await playScene(pack, selectedTakes, canvas.current, mode === 'export');
      scene.current = handle;
      const result = await handle.done;
      if (result) {
        const url = URL.createObjectURL(result);
        const link = document.createElement('a');
        link.href = url;
        link.download = `webby-voicer-${slug(pack.name)}.${result.type.includes('mp4') ? 'mp4' : 'webm'}`;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
        setMessage('Video downloaded.');
      } else setMessage('Scene finished.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Scene playback failed.'); }
    finally { scene.current = undefined; setSceneMode(undefined); }
  };
  const goHome = () => { if (new URLSearchParams(location.search).has('room')) history.replaceState(null, '', location.pathname); setMarketOpen(false); setRoomMode(undefined); setScreen(pack ? 'ready' : 'start'); };
  const header = <header className="topbar">
    <button className="brand" onClick={goHome}>webby<span>voicer</span><i>✳</i></button>
    <span className="topbar-center">a tiny dubbing studio</span>
    <nav aria-label="Main navigation"><button onClick={() => { if (new URLSearchParams(location.search).has('room')) history.replaceState(null, '', location.pathname); setMarketOpen(true); setRoomMode(undefined); }}>Pack market</button><button onClick={() => { if (new URLSearchParams(location.search).has('room')) history.replaceState(null, '', location.pathname); setMarketOpen(false); setRoomMode(undefined); setScreen('start'); }}>Home</button></nav>
  </header>;

  if (roomMode) return <div className="app-shell">{header}<Room initialPack={roomMode.kind === 'create' ? pack : undefined} shareZip={roomMode.kind === 'create' ? shareZip : undefined} joinCode={roomMode.code} onExit={goHome} /></div>;
  if (marketOpen) return <div className="app-shell">{header}<Marketplace onBack={() => setMarketOpen(false)} backLabel="Back" /></div>;

  return <div className="app-shell">{header}<main className={'app-main app-main-' + screen}>
    <input ref={zipInput} type="file" accept=".zip" hidden onChange={(event) => void load('zip', event.target.files)} />
    <input ref={folderInput} type="file" hidden multiple onChange={(event) => void load('folder', event.target.files)} />

    {screen === 'start' && <section className="start-view">
      <span className="doodle doodle-left" aria-hidden="true">✳</span><span className="doodle doodle-right" aria-hidden="true">♪</span>
      <div className="intro"><span className="kicker">WELCOME TO YOUR STUDIO</span><h1>Make the scene<br /><span>your own.</span></h1><p>Pick a pack, record a line, and play it back with friends.</p></div>
      <div className="window start-window"><div className="window-bar"><span className="traffic"><i/><i/><i/></span><span>new scene</span><span>✦</span></div>
        <div className="start-content"><button className="button primary main-action" disabled={busy} onClick={() => void tryDemo()}>▶ &nbsp; Try the demo</button>
          <div className="start-split"><button className="button secondary" disabled={busy} onClick={() => zipInput.current?.click()}>↑ &nbsp; Open pack ZIP</button><button className="text-button" disabled={busy} onClick={() => folderInput.current?.click()}>or folder</button></div>
          <div className="divider"><span>playing with friends?</span></div>
          <div className="join-row"><input aria-label="Six-character room code" placeholder="ROOM CODE" maxLength={6} value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ''))}/><button className="button dark" disabled={joinCode.length !== 6} onClick={() => setRoomMode({ kind: 'join', code: joinCode })}>Join →</button></div>
        </div></div><button className="under-link" onClick={() => setMarketOpen(true)}>Browse the pack market ↗</button>
    </section>}

    {screen === 'ready' && pack && <section className="ready-view window">
      <div className="window-bar"><span className="traffic"><i/><i/><i/></span><span>pack ready</span><button onClick={() => setScreen('start')}>×</button></div>
      <div className="ready-layout"><div className="ready-video"><video ref={readyVideo} playsInline src={videoUrl || undefined} aria-label="Original scene" onEnded={() => setReadyPlaying(false)} onLoadedMetadata={(event) => setVideoDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : null)}/><button className="video-play" disabled={videoCompatibility !== 'ready'} onClick={() => { const player = readyVideo.current; if (!player) return; if (player.paused) void player.play().then(() => setReadyPlaying(true)); else { player.pause(); setReadyPlaying(false); } }}>{readyPlaying ? '■ Pause scene' : '▶ Play scene'}</button></div>
        <div className="ready-copy"><span className="kicker">YOUR SCENE IS READY</span><div className="pack-heading">{packIconUrl && <img src={packIconUrl} alt=""/>}<h1 title={pack.name}>{pack.name}</h1></div><p>by {pack.author}</p><div className="facts"><span>{pack.lines.length} lines</span><span>{new Set(pack.lines.map((item) => item.character)).size} roles</span><span>{videoDuration === null ? '—' : timecode(videoDuration)}</span></div>
          {videoCompatibility === 'unsupported' ? <div className="compat-mini">Could not prepare this video on this device.</div> : videoCompatibility === 'converting' ? <div className="compat-mini">Preparing video {convertProgress}%<progress value={convertProgress} max={100}/></div> : videoCompatibility === 'checking' ? <div className="compat-mini">Checking video…</div> : null}
          <div className="ready-actions"><button className="button primary" disabled={videoCompatibility !== 'ready'} onClick={() => setScreen('solo')}>Rehearse solo →</button><button className="button secondary" disabled={!shareZip || videoCompatibility !== 'ready'} onClick={() => setRoomMode({ kind: 'create' })}>Host a room →</button></div>
        </div></div></section>}

    {screen === 'solo' && pack && line && <section className="studio window">
      <div className="window-bar"><span className="traffic"><i/><i/><i/></span><span>{pack.name}</span><button onClick={() => { recorder.current?.cancel(); recorder.current = undefined; setRecording(false); setRecordingStream(undefined); setScreen('ready'); }}>×</button></div>
      <div className="studio-layout"><div className="studio-stage"><div className="studio-title"><div><span className="kicker">SOLO STUDIO</span><h1>Give it your voice.</h1></div><span className="count-pill">{takes.size}/{pack.lines.length} recorded</span></div><div className="video-box"><video ref={playback.video} playsInline muted src={videoUrl || undefined} onLoadedMetadata={playback.onVideoReady} className={sceneMode ? 'hidden' : ''} aria-label="Original scene"/><canvas ref={canvas} className={sceneMode ? 'active' : ''} aria-label="Mixed scene"/></div><div className="studio-play"><button className="button secondary" disabled={!!sceneMode || recording || videoCompatibility !== 'ready'} onClick={() => void runScene('preview')}>▶ Mixed scene</button><button className="button secondary" disabled={!!sceneMode || recording || videoCompatibility !== 'ready'} onClick={() => void runScene('export')}>↓ Export video</button>{sceneMode && <button className="button ghost" onClick={() => scene.current?.stop()}>Stop</button>}</div></div>
      <div className="studio-record"><div className="line-nav"><button disabled={recording || selected === 0} onClick={() => setSelected(selected - 1)} aria-label="Previous line">←</button><select aria-label="Choose line" disabled={recording} value={selected} onChange={(event) => setSelected(Number(event.target.value))}>{pack.lines.map((item, index) => <option value={index} key={item.id}>{index + 1} / {pack.lines.length} · {item.character}{takes.has(item.id) ? ' ✓' : ''}</option>)}</select><button disabled={recording || selected === pack.lines.length - 1} onClick={() => setSelected(selected + 1)} aria-label="Next line">→</button></div>
        <div className="caption-box"><span className="kicker">{line.character} · {timecode(line.startsAt)}</span><h2 title={line.caption}>{line.caption}</h2>{lineImageUrl && <img src={lineImageUrl} alt="" />}</div>
        <Waveform original={line.original.blob} take={recording ? undefined : takes.get(line.id)?.blob} stream={recordingStream} recording={recording} cursor={playback.cursor} playing={playback.playing} onPlayOriginal={() => void playback.toggle('original').catch((error) => setMessage(String(error)))} onPlayTake={() => void playback.toggle('take').catch((error) => setMessage(String(error)))}/><audio ref={playback.original} src={originalUrl || undefined} onTimeUpdate={() => playback.onTimeUpdate('original')} onEnded={playback.stop} hidden/><audio ref={playback.take} src={takes.get(line.id)?.url} onTimeUpdate={() => playback.onTimeUpdate('take')} onEnded={playback.stop} hidden/>
        <button className={'button record-action ' + (recording ? 'recording' : 'primary')} onClick={() => void (recording ? stop() : start())}>{recording ? '■ Stop & save' : takes.has(line.id) ? '● Retake this line' : '● Record this line'}</button>
      </div></div></section>}

    {!!errors.length && <div className="app-toast alert" role="alert">{errors.join(' ')}</div>}
    {message && <div className="app-toast status" role="status">{message}</div>}
  </main></div>;
}

function slug(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'scene'; }
function timecode(value: number): string { return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`; }
