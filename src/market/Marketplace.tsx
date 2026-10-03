import { useEffect, useState } from 'react';

type Item = { id: number; title: string; creator: string; category: string; sourceUrl: string; imageUrl?: string; nsfw: boolean };
type Props = { onBack: () => void; backLabel?: string };

export default function Marketplace({ onBack }: Props) {
  const [shelf, setShelf] = useState<'curated' | 'community'>('curated');
  const [page, setPage] = useState(1);
  const [index, setIndex] = useState(0);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    const query = shelf === 'curated' ? '?shelf=curated' : `?page=${page}`;
    void fetch(`/api/market${query}`, { signal: controller.signal }).then(async (response) => {
      const result = await response.json() as { items?: Item[]; error?: string };
      if (!response.ok) throw new Error(result.error || 'Marketplace is unavailable.');
      setItems(result.items || []); setIndex(0);
    }).catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [shelf, page]);
  const item = items[index];
  return <main className="market-page"><section className="market-window window"><div className="window-bar"><span className="traffic"><i/><i/><i/></span><span>pack market</span><button onClick={onBack}>×</button></div><div className="market-inner"><div className="market-heading"><div><span className="kicker">FIND A NEW SCENE</span><h1>Pack market.</h1></div><div className="market-switch"><button className={shelf === 'curated' ? 'active' : ''} onClick={() => { setShelf('curated'); setIndex(0); }}>Starter picks</button><button className={shelf === 'community' ? 'active' : ''} onClick={() => { setShelf('community'); setPage(1); setIndex(0); }}>Latest</button></div></div>{error && <p className="alert" role="alert">{error}</p>}{loading ? <div className="market-empty">Loading packs…</div> : item ? <article className="market-feature"><div className="market-image">{item.imageUrl ? <img src={item.imageUrl} alt=""/> : <span>♫</span>}</div><div className="market-copy"><span className="kicker">{item.category}{item.nsfw ? ' · MATURE' : ''}</span><h2 title={item.title}>{item.title}</h2><p>by {item.creator}</p><a className="button primary" href={item.sourceUrl} target="_blank" rel="noopener noreferrer">See pack on GameBanana ↗</a></div></article> : <div className="market-empty">No packs on this page.</div>}<div className="market-bottom"><div className="market-pagination"><button className="button secondary" disabled={loading || (index === 0 && (shelf !== 'community' || page === 1))} onClick={() => { if (index > 0) setIndex(index - 1); else { setPage(page - 1); setIndex(0); } }}>← Previous</button><span>{loading ? '…' : items.length ? (index + 1) + ' / ' + items.length + (shelf === 'community' ? ' · page ' + page : '') : '0 packs'}</span><button className="button secondary" disabled={loading || !items.length || (shelf === 'curated' && index === items.length - 1)} onClick={() => { if (index < items.length - 1) setIndex(index + 1); else if (shelf === 'community') setPage(page + 1); }}>Next →</button></div><p>Source: <a href="https://gamebanana.com/games/20674" target="_blank" rel="noopener noreferrer">The Choicer Voicer on GameBanana</a></p></div></div></section></main>;
}
