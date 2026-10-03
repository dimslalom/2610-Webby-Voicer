import { useEffect, useRef, useState } from 'react';
import { importZip } from '../pack/import';
import type { DubPack } from '../pack/types';
import { startLineRecording, type RecordingSession } from '../media/recording';
import { playScene, type SceneHandle } from '../media/render';
import { canPlayPackVideo, convertPackVideo } from '../media/compatibility';
import Waveform from '../media/Waveform';
import { useLinePlayback } from '../media/useLinePlayback';

type Person = { id: string; name: string; kind: 'performer' | 'spectator'; online: boolean };
type RoomView = {
  code: string; hostId: string; phase: 'lobby' | 'recording' | 'showcase' | 'ended';
  locked: boolean; turnMode: 'turns' | 'simultaneous'; currentLine: number;
  showcaseAt?: number; serverNow: number;
  reactionsEnabled: boolean; votingEnabled: boolean; packReady: boolean;
  pack?: { name: string; author: string; lines: { id: string; character: string; caption: string; startsAt: number }[] };
  participants: Person[]; assignments: Record<string, string>;
  takes: Record<string, { ownerId: string; at: number }>;
  votes: Record<string, string>; reactions: { from: string; emoji: string; at: number }[];
};
type Identity = { code: string; id: string; token: string };
type Props = { initialPack?: DubPack; shareZip?: Blob; joinCode?: string; onExit: () => void };
const apiRoot = '/api/rooms';

export default function Room({ initialPack, shareZip, joinCode, onExit }: Props) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'performer' | 'spectator'>('performer');
  const [identity, setIdentity] = useState<Identity>();
  const [room, setRoom] = useState<RoomView>();
  const [pack, setPack] = useState(initialPack);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [connected, setConnected] = useState(false);
  const [selected, setSelected] = useState(0);
  const [recording, setRecording] = useState(false);
  const [recordingStream, setRecordingStream] = useState<MediaStream>();
  const [roleIndex, setRoleIndex] = useState(0);
  const [heardLineIndex, setHeardLineIndex] = useState(0);
  const [recordTab, setRecordTab] = useState<'record' | 'takes'>('record');
  const [localTakes, setLocalTakes] = useState<Map<string, { blob: Blob; url: string }>>(new Map());
  const [heard, setHeard] = useState<Map<string, string>>(new Map());
  const [sceneMode, setSceneMode] = useState<'preview' | 'export'>();
  const [videoCompatibility, setVideoCompatibility] = useState<'checking' | 'ready' | 'unsupported' | 'converting'>('checking');
  const [convertProgress, setConvertProgress] = useState(0);
  const [originalUrl, setOriginalUrl] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const heardPlayer = useRef<HTMLAudioElement>(null);
  const [heardPlaying, setHeardPlaying] = useState(false);
  const socket = useRef<WebSocket | null>(null);
  const recorder = useRef<RecordingSession | null>(null);
  const scene = useRef<SceneHandle | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const clockOffset = useRef(0);
  const autoShowcase = useRef<number | undefined>(undefined);
  const mounted = useRef(true);
  const takesRef = useRef(localTakes);
  const heardRef = useRef(heard);
  useEffect(() => { if (!status) return; const timer = window.setTimeout(() => setStatus(''), 3500); return () => clearTimeout(timer); }, [status]);
  useEffect(() => { takesRef.current = localTakes; }, [localTakes]);
  useEffect(() => { heardRef.current = heard; }, [heard]);
  useEffect(() => () => {
    mounted.current = false;
    socket.current?.close(); recorder.current?.cancel(); scene.current?.stop();
    takesRef.current.forEach((take) => URL.revokeObjectURL(take.url));
    heardRef.current.forEach(URL.revokeObjectURL);
  }, []);
  useEffect(() => {
    if (!joinCode) return;
    const saved = sessionStorage.getItem(`webby-room-${joinCode}`);
    if (!saved) return;
    try {
      const previous = JSON.parse(saved) as Identity;
      void getState(previous).then((next) => {
        if (mounted.current) { clockOffset.current = Date.now() - next.serverNow; setIdentity(previous); setRoom(next); void connect(previous); }
      }).catch(() => sessionStorage.removeItem(`webby-room-${joinCode}`));
    } catch { sessionStorage.removeItem(`webby-room-${joinCode}`); }
  // A saved identity is restored only when the room view first opens.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinCode]);
  useEffect(() => {
    if (!identity || pack || !room?.packReady) return;
    let cancelled = false;
    void api(`${apiRoot}/${identity.code}/pack`, { token: identity.token }).then(async (response) => {
      const result = await importZip(new File([await response.blob()], 'room-pack.zip'));
      if (!cancelled) {
        if (result.pack) setPack(result.pack);
        else setError(result.errors.join(' '));
      }
    }).catch((reason) => { if (!cancelled) setError(String(reason)); });
    return () => { cancelled = true; };
  }, [identity, room?.packReady, pack]);
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
      } catch (reason) { if (!cancelled) { setVideoCompatibility('unsupported'); setError(reason instanceof Error ? reason.message : 'Video preparation failed.'); } }
    }).catch((reason) => { if (!cancelled) { setVideoCompatibility('unsupported'); setError(String(reason)); } });
    return () => { cancelled = true; };
  }, [pack]);
  useEffect(() => {
    if (!pack) return;
    const url = URL.createObjectURL(pack.video.blob);
    setVideoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pack]);

  async function connect(current: Identity): Promise<WebSocket> {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${location.host}${apiRoot}/${current.code}/ws?token=${encodeURIComponent(current.token)}`);
    socket.current = ws;
    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as { type: string; room: RoomView };
        if (payload.type === 'state') { clockOffset.current = Date.now() - payload.room.serverNow; setRoom(payload.room); }
      } catch { /* ignore unknown message */ }
    };
    ws.onclose = (event) => {
      if (!mounted.current) return;
      setConnected(false);
      if (event.code !== 1000) setTimeout(() => { if (mounted.current) void connect(current).catch(() => setError('Room connection lost.')); }, 1500);
    };
    return new Promise((resolve, reject) => {
      ws.onopen = () => { setConnected(true); resolve(ws); };
      ws.onerror = () => reject(new Error('Could not connect to the room.'));
    });
  }
  function send(type: string, values: Record<string, unknown> = {}) {
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify({ type, ...values }));
    else setError('Room connection lost. Reopen the room to reconnect.');
  }
  async function enter() {
    setError(''); setStatus('Opening room…');
    try {
      const endpoint = joinCode ? `${apiRoot}/${joinCode}/join` : apiRoot;
      const response = await api(endpoint, { method: 'POST', body: { name, kind } });
      const data = await response.json() as Identity & { room: RoomView };
      const next = { code: data.code, id: data.id, token: data.token };
      sessionStorage.setItem(`webby-room-${next.code}`, JSON.stringify(next));
      clockOffset.current = Date.now() - data.room.serverNow;
      setIdentity(next); setRoom(data.room);
      const ws = await connect(next);
      if (!joinCode && initialPack && shareZip) {
        setStatus('Sharing pack with the room…');
        await api(`${apiRoot}/${next.code}/pack`, { method: 'PUT', token: next.token, blob: shareZip });
        ws.send(JSON.stringify({ type: 'packInfo', pack: {
          name: initialPack.name, author: initialPack.author,
          lines: initialPack.lines.map(({ id, character, caption, startsAt }) => ({ id, character, caption, startsAt })),
        } }));
      }
      setStatus('Room ready.');
      history.replaceState(null, '', `?room=${next.code}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not open room.'); setStatus(''); }
  }
  const host = !!identity && identity.id === room?.hostId;
  const me = room?.participants.find((person) => person.id === identity?.id);
  const roles = Array.from(new Set(room?.pack?.lines.map((line) => line.character) || []));
  const currentLine = room?.pack?.lines[room.currentLine];
  const assigned = room?.pack?.lines.filter((line) => room.assignments[line.character] === identity?.id) || [];
  const visibleLines = room?.turnMode === 'turns' ? assigned.filter((line) => line.id === currentLine?.id) : assigned;
  const selectedInfo = room?.pack?.lines[selected];
  const chosenInfo = room?.turnMode === 'turns' ? currentLine : visibleLines.find((item) => item.id === selectedInfo?.id) || visibleLines[0];
  const line = pack?.lines.find((item) => item.id === chosenInfo?.id);
  const playback = useLinePlayback(line?.startsAt || 0, originalUrl, line ? localTakes.get(line.id)?.url : undefined);
  const canRecord = room?.phase === 'recording' && me?.kind === 'performer' && !!line && room.assignments[line.character] === me.id && (room.turnMode === 'simultaneous' || line.id === currentLine?.id);
  useEffect(() => {
    if (!line) return;
    const url = URL.createObjectURL(line.original.blob);
    setOriginalUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [line]);
  async function toggleRecord() {
    if (recording) {
      if (!recorder.current || !line) return;
      try {
        const blob = await recorder.current.stop();
        const url = URL.createObjectURL(blob);
        setLocalTakes((old) => {
          const next = new Map(old); const previous = next.get(line.id);
          if (previous) URL.revokeObjectURL(previous.url);
          next.set(line.id, { blob, url }); return next;
        });
        setStatus('Take saved locally. Listen, retake, or submit it.');
      } catch (reason) { setError(String(reason)); }
      finally { recorder.current = null; setRecordingStream(undefined); setRecording(false); }
    } else {
      playback.stop();
      try { recorder.current = await startLineRecording(); setRecordingStream(recorder.current.stream); setRecording(true); setStatus('Recording…'); }
      catch (reason) { setError(String(reason)); }
    }
  }
  async function submit() {
    if (!identity || !line) return;
    const take = localTakes.get(line.id);
    if (!take) return;
    try {
      await api(`${apiRoot}/${identity.code}/takes/${encodeURIComponent(line.id)}`, { method: 'PUT', token: identity.token, blob: take.blob });
      setStatus('Take submitted. Everyone in the room can hear it now.');
    } catch (reason) { setError(String(reason)); }
  }
  async function listen(id: string) {
    if (!identity) return;
    try {
      const response = await api(`${apiRoot}/${identity.code}/takes/${encodeURIComponent(id)}`, { token: identity.token });
      const url = URL.createObjectURL(await response.blob());
      setHeard((old) => { const next = new Map(old); const previous = next.get(id); if (previous) URL.revokeObjectURL(previous); next.set(id, url); return next; });
    } catch (reason) { setError(String(reason)); }
  }
  async function runScene(exportVideo: boolean) {
    if (!pack || !room || !identity || !canvas.current) return;
    playback.stop();
    setSceneMode(exportVideo ? 'export' : 'preview'); setStatus(exportVideo ? 'Rendering video…' : 'Playing showcase…');
    try {
      const submitted = new Map<string, Blob>();
      for (const id of Object.keys(room.takes)) {
        const response = await api(`${apiRoot}/${identity.code}/takes/${encodeURIComponent(id)}`, { token: identity.token });
        submitted.set(id, await response.blob());
      }
      const handle = await playScene(pack, submitted, canvas.current, exportVideo);
      scene.current = handle;
      const result = await handle.done;
      if (result) {
        const url = URL.createObjectURL(result);
        const anchor = document.createElement('a'); anchor.href = url;
        anchor.download = `webby-voicer-room-${identity.code}.${result.type.includes('mp4') ? 'mp4' : 'webm'}`;
        anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 60_000);
        setStatus('Video downloaded.');
      } else setStatus('Showcase finished.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Showcase failed.'); }
    finally { scene.current = null; setSceneMode(undefined); }
  }
  useEffect(() => {
    if (room?.phase !== 'showcase' || !room.showcaseAt || !pack || videoCompatibility !== 'ready' || autoShowcase.current === room.showcaseAt) return;
    const scheduledAt = room.showcaseAt;
    const target = scheduledAt + clockOffset.current;
    const tick = () => {
      const remaining = target - Date.now();
      if (remaining > 0) {
        setStatus(`Showcase starts in ${Math.ceil(remaining / 1000)} seconds…`);
        return;
      }
      clearInterval(timer);
      if (autoShowcase.current !== scheduledAt && mounted.current) {
        autoShowcase.current = scheduledAt;
        void runScene(false);
      }
    };
    const timer = setInterval(tick, 250);
    tick();
    return () => clearInterval(timer);
  // The room's scheduled timestamp identifies one playback, even when other room state changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.showcaseAt, room?.phase, pack, videoCompatibility]);
  async function endRoom() {
    if (!identity) return;
    try { await api(`${apiRoot}/${identity.code}/end`, { method: 'POST', token: identity.token }); setStatus('Room ended and shared media deleted.'); }
    catch (reason) { setError(String(reason)); }
  }
  const chosenRole = roles[Math.min(roleIndex, roles.length - 1)];
  const roleOwner = room?.participants.find((person) => person.id === room.assignments[chosenRole]);
  const heardLine = room?.pack?.lines[Math.min(heardLineIndex, (room.pack?.lines.length || 1) - 1)];
  return <main className="room-page">
    {!identity ? <section className="room-entry window"><div className="window-bar"><span className="traffic"><i/><i/><i/></span><span>{joinCode ? 'join room' : 'new room'}</span><button onClick={onExit}>×</button></div><div className="room-entry-inner"><span className="kicker">{joinCode ? 'YOU ARE INVITED' : 'BRING YOUR FRIENDS'}</span><h1>{joinCode ? 'Join the cast.' : 'Start a room.'}</h1><p>{joinCode ? 'Type your name and jump in.' : 'Your pack is ready to share with your cast.'}</p>{initialPack && <div className="room-pack">{initialPack.name} <small>· {initialPack.lines.length} lines</small></div>}<label className="field">Your name<input value={name} maxLength={32} onChange={(event) => setName(event.target.value)} placeholder="Stage name"/></label>{joinCode && <label className="field">Join as<select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}><option value="performer">Performer</option><option value="spectator">Spectator</option></select></label>}<button className="button primary" disabled={!name.trim()} onClick={() => void enter()}>{joinCode ? 'Join room →' : 'Create room →'}</button></div></section> : room && <section className="room-window window"><div className="window-bar"><span className="traffic"><i/><i/><i/></span><span>room {room.code} · {room.phase}</span><button onClick={onExit}>×</button></div>
      <div className="room-body"><div className="room-head"><div><span className="kicker">{connected ? '● LIVE ROOM' : '○ RECONNECTING'}</span><h1>{room.pack?.name || 'Waiting for pack'}</h1></div><div className="room-head-actions"><button className="button secondary" onClick={() => void navigator.clipboard.writeText(location.origin + '?room=' + room.code)}>Copy invite</button>{host && room.phase !== 'ended' && <button className="button ghost" onClick={() => { if (window.confirm('End this room and delete its shared media?')) void endRoom(); }}>End</button>}</div></div>
      {room.phase !== 'recording' && videoCompatibility === 'unsupported' && <div className="compat-mini">Could not prepare this video on this device.</div>}
      {room.phase !== 'recording' && videoCompatibility === 'converting' && <div className="compat-mini">Preparing video {convertProgress}% <progress value={convertProgress} max={100}/></div>}
      {room.phase === 'lobby' && <div className="room-lobby">
        <div className="room-section"><span className="kicker">THE CAST · {room.participants.length}/8 PLAYERS</span><h2>Pick your part.</h2><label className="field">Role<select value={roleIndex} onChange={(event) => setRoleIndex(Number(event.target.value))}>{roles.map((role, index) => <option key={role} value={index}>{role}</option>)}</select></label>{chosenRole && <div className="role-choice"><strong>{chosenRole}</strong><span>{roleOwner?.name || 'Open'}</span>{host ? <select aria-label={'Assign ' + chosenRole} value={roleOwner?.id || ''} onChange={(event) => send('assign', { role: chosenRole, personId: event.target.value })}><option value="">Open</option>{room.participants.filter((person) => person.kind === 'performer').map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select> : me?.kind === 'performer' && !roleOwner ? <button className="button secondary" onClick={() => send('claim', { role: chosenRole })}>Claim role</button> : null}</div>}<select className="player-select" aria-label="Players in room" defaultValue=""><option value="">Players · {room.participants.length}</option>{room.participants.map((person) => <option key={person.id} value={person.id}>{person.online ? '●' : '○'} {person.name}{person.id === room.hostId ? ' · host' : ''} · {person.kind}</option>)}</select></div>
        <div className="room-section settings"><span className="kicker">ROOM SETTINGS</span><h2>Ready to play?</h2>{host ? <><label className="field">Recording style<select value={room.turnMode} onChange={(event) => send('settings', { turnMode: event.target.value })}><option value="turns">One line at a time</option><option value="simultaneous">At the same time</option></select></label><label className="toggle">Lock new joins<input type="checkbox" checked={room.locked} onChange={(event) => send('settings', { locked: event.target.checked })}/></label><label className="toggle">Reactions<input type="checkbox" checked={room.reactionsEnabled} onChange={(event) => send('settings', { reactionsEnabled: event.target.checked })}/></label><label className="toggle">Voting<input type="checkbox" checked={room.votingEnabled} onChange={(event) => send('settings', { votingEnabled: event.target.checked })}/></label><button className="button primary" disabled={!room.packReady || !room.pack?.lines.length || videoCompatibility !== 'ready'} onClick={() => send('start')}>Start dubbing →</button></> : <p>Waiting for the host to start.</p>}</div>
      </div>}
      {room.phase === 'recording' && <div className="room-record"><div className="room-record-tabs"><button className={recordTab === 'record' ? 'active' : ''} onClick={() => setRecordTab('record')}>Record</button><button className={recordTab === 'takes' ? 'active' : ''} onClick={() => setRecordTab('takes')}>Takes · {Object.keys(room.takes).length}</button></div><div className={'room-record-main ' + (recordTab === 'record' ? 'is-active' : '')}><span className="kicker">RECORDING · {room.turnMode === 'turns' ? 'LINE ' + (room.currentLine + 1) + ' / ' + room.pack?.lines.length : 'YOUR LINES'}</span>{room.turnMode === 'simultaneous' && <label className="field">Your line<select value={chosenInfo ? room.pack?.lines.findIndex((item) => item.id === chosenInfo.id) : ''} onChange={(event) => setSelected(Number(event.target.value))}>{visibleLines.map((item) => <option key={item.id} value={room.pack?.lines.findIndex((candidate) => candidate.id === item.id)}>{item.character}: {item.caption}</option>)}</select></label>}<h2 title={chosenInfo?.caption}>{chosenInfo?.caption || 'Waiting for your line…'}</h2><p>{chosenInfo?.character || 'The cast is recording.'}</p>{line && <div className="room-video"><video ref={playback.video} src={videoUrl || undefined} muted playsInline onLoadedMetadata={playback.onVideoReady} aria-label="Original scene"/></div>}{line && canRecord ? <><Waveform original={line.original.blob} take={recording ? undefined : localTakes.get(line.id)?.blob} stream={recordingStream} recording={recording} canPlay={videoCompatibility === 'ready'} cursor={playback.cursor} playing={playback.playing} onPlayOriginal={() => void playback.toggle('original').catch((reason) => setError(String(reason)))} onPlayTake={() => void playback.toggle('take').catch((reason) => setError(String(reason)))}/><audio ref={playback.original} src={originalUrl || undefined} onTimeUpdate={() => playback.onTimeUpdate('original')} onEnded={playback.stop} hidden/><audio ref={playback.take} src={localTakes.get(line.id)?.url} onTimeUpdate={() => playback.onTimeUpdate('take')} onEnded={playback.stop} hidden/><div className="room-record-actions"><button className={'button ' + (recording ? 'recording' : 'primary')} onClick={() => void toggleRecord()}>{recording ? '■ Stop & save' : localTakes.has(line.id) ? '● Retake' : '● Record'}</button>{localTakes.has(line.id) && <button className="button secondary" onClick={() => void submit()}>Submit take →</button>}</div></> : <p>Watch while the assigned performer records.</p>}{host && <div className="host-actions">{room.turnMode === 'turns' && <button className="button secondary" onClick={() => send('advance')}>Next line →</button>}<button className="button dark" onClick={() => send('showcase')}>Start showcase →</button></div>}</div><div className={'room-heard ' + (recordTab === 'takes' ? 'is-active' : '')}><span className="kicker">SUBMITTED TAKES · {Object.keys(room.takes).length}/{room.pack?.lines.length}</span><label className="field">Choose line<select value={heardLineIndex} onChange={(event) => setHeardLineIndex(Number(event.target.value))}>{room.pack?.lines.map((item, index) => <option key={item.id} value={index}>{index + 1}. {item.character}{room.takes[item.id] ? ' ✓' : ''}</option>)}</select></label>{heardLine && <div className="heard-choice"><strong>{heardLine.character}</strong><p title={heardLine.caption}>{heardLine.caption}</p>{room.takes[heardLine.id] ? !heard.has(heardLine.id) && <button className="button secondary" onClick={() => void listen(heardLine.id)}>Load take</button> : <span>Waiting for a take</span>}{heard.get(heardLine.id) && <><audio ref={heardPlayer} src={heard.get(heardLine.id)} onEnded={() => setHeardPlaying(false)} hidden/><button className="button secondary" onClick={() => { const player = heardPlayer.current; if (!player) return; if (player.paused) void player.play().then(() => setHeardPlaying(true)); else { player.pause(); setHeardPlaying(false); } }}>{heardPlaying ? '■ Pause take' : '▶ Play take'}</button></>}</div>}</div></div>}
      {room.phase === 'showcase' && <div className="showcase"><span className="kicker">THE SHOWCASE</span><h2>Watch it together.</h2><canvas ref={canvas} className="showcase-canvas" aria-label="Mixed scene"/><div className="showcase-actions"><button className="button secondary" disabled={!!sceneMode || !pack || videoCompatibility !== 'ready'} onClick={() => void runScene(false)}>▶ Play scene</button>{me?.kind === 'performer' && <button className="button primary" disabled={!!sceneMode || !pack || videoCompatibility !== 'ready'} onClick={() => void runScene(true)}>↓ Export video</button>}{sceneMode && <button className="button ghost" onClick={() => scene.current?.stop()}>Stop</button>}</div>{room.reactionsEnabled && <div className="reactions">{['👏', '😂', '❤️', '🔥'].map((emoji) => <button key={emoji} onClick={() => send('reaction', { emoji })}>{emoji}</button>)}<span>{room.reactions.slice(-8).map((reaction) => reaction.emoji).join(' ')}</span></div>}{room.votingEnabled && <label className="field vote">Favorite performance<select value={room.votes[identity.id] || ''} onChange={(event) => send('vote', { personId: event.target.value })}><option value="">Choose a performer</option>{room.participants.filter((person) => person.kind === 'performer').map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>}</div>}
      {room.phase === 'ended' && <div className="room-ended"><h2>Room ended.</h2><p>Shared media has been deleted.</p><button className="button primary" onClick={onExit}>Back to start</button></div>}
      </div></section>}
    {status && <div className="app-toast status" role="status">{status}</div>}{error && <div className="app-toast alert" role="alert">{error}</div>}
  </main>;
}

async function api(path: string, options: { method?: string; token?: string; body?: unknown; blob?: Blob } = {}): Promise<Response> {
  const response = await fetch(path, { method: options.method || 'GET', headers: {
    ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    ...(options.blob ? { 'Content-Type': options.blob.type || 'application/octet-stream' } : { 'Content-Type': 'application/json' }),
  }, body: options.blob || (options.body ? JSON.stringify(options.body) : undefined) });
  if (!response.ok) {
    const data = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error || `Request failed (${response.status}).`);
  }
  return response;
}
async function getState(identity: Identity): Promise<RoomView> {
  const response = await api(`${apiRoot}/${identity.code}/state`, { token: identity.token });
  return ((await response.json()) as { room: RoomView }).room;
}
