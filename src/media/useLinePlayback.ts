import { useEffect, useRef, useState } from 'react';

type Track = 'original' | 'take';

export function useLinePlayback(startsAt: number, originalUrl: string, takeUrl?: string) {
  const video = useRef<HTMLVideoElement>(null);
  const original = useRef<HTMLAudioElement>(null);
  const take = useRef<HTMLAudioElement>(null);
  const generation = useRef(0);
  const [playing, setPlaying] = useState<Track>();
  const [cursor, setCursor] = useState<number | null>(null);

  const stop = () => {
    generation.current++;
    video.current?.pause();
    original.current?.pause();
    take.current?.pause();
    setPlaying(undefined);
  };

  useEffect(() => {
    generation.current++;
    video.current?.pause();
    original.current?.pause();
    take.current?.pause();
    setPlaying(undefined);
    setCursor(null);
    const player = video.current;
    if (player && player.readyState >= 1) player.currentTime = Math.min(startsAt, Number.isFinite(player.duration) ? player.duration : startsAt);
  }, [startsAt, originalUrl, takeUrl]);
  useEffect(() => () => { video.current?.pause(); original.current?.pause(); take.current?.pause(); }, []);

  const toggle = async (track: Track) => {
    if (playing === track) { stop(); return; }
    stop();
    const media = track === 'original' ? original.current : take.current;
    const picture = video.current;
    if (!media || !picture) throw new Error('The line is still loading.');
    media.currentTime = 0;
    picture.currentTime = startsAt;
    picture.muted = true;
    const request = ++generation.current;
    try {
      await Promise.all([picture.play(), media.play()]);
      if (request !== generation.current) { picture.pause(); media.pause(); return; }
      setPlaying(track);
      setCursor(0);
    } catch {
      picture.pause();
      media.pause();
      throw new Error('Could not play this line.');
    }
  };

  const onTimeUpdate = (track: Track) => {
    const media = track === 'original' ? original.current : take.current;
    const picture = video.current;
    if (!media) return;
    setCursor(media.currentTime);
    if (picture && !picture.paused && Math.abs(picture.currentTime - (startsAt + media.currentTime)) > 0.12) {
      picture.currentTime = startsAt + media.currentTime;
    }
  };

  const onVideoReady = () => {
    const picture = video.current;
    if (picture) picture.currentTime = Math.min(startsAt, picture.duration || startsAt);
  };

  return { video, original, take, playing, cursor, toggle, stop, onTimeUpdate, onVideoReady };
}
