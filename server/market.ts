export type MarketItem = {
  id: number; title: string; creator: string; category: string;
  sourceUrl: string; imageUrl?: string; nsfw: boolean;
};

const curatedIds = [723080, 723073, 723057];
const fields = 'name,Owner().name,Url().sProfileUrl(),RootCategory().name,Preview().sSubFeedImageUrl(),Nsfw().bIsNsfw(),Trash().bIsTrashed(),Withhold().bIsWithheld(),Game().name';

export async function market(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const curated = url.searchParams.get('shelf') === 'curated';
  const page = Math.max(1, Math.min(500, Number(url.searchParams.get('page')) || 1));
  try {
    let ids = curatedIds;
    if (!curated) {
      const listUrl = new URL('https://api.gamebanana.com/Core/List/New');
      listUrl.search = new URLSearchParams({ itemtype: 'Mod', gameid: '20674', page: String(page), format: 'json' }).toString();
      const listResponse = await fetch(listUrl, { headers: { Accept: 'application/json' } });
      if (!listResponse.ok) throw new Error('GameBanana listing is unavailable.');
      const list = await listResponse.json() as unknown;
      if (!Array.isArray(list)) throw new Error('GameBanana returned an unexpected list.');
      ids = list.filter((row): row is [string, number] => Array.isArray(row) && row[0] === 'Mod' && Number.isInteger(row[1])).map((row) => row[1]);
    }
    const resolved = await Promise.allSettled(ids.map(fetchItem));
    const items = resolved.flatMap((result) => result.status === 'fulfilled' && result.value ? [result.value] : []);
    return Response.json({ items, page, curated, source: 'GameBanana' }, { headers: { 'Cache-Control': 'public, max-age=300' } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Marketplace unavailable.' }, { status: 502 });
  }
}

async function fetchItem(id: number): Promise<MarketItem | undefined> {
  const itemUrl = new URL('https://api.gamebanana.com/Core/Item/Data');
  itemUrl.search = new URLSearchParams({ itemtype: 'Mod', itemid: String(id), fields, return_keys: '1', format: 'json' }).toString();
  const response = await fetch(itemUrl, { headers: { Accept: 'application/json' } });
  if (!response.ok) return;
  const item = await response.json() as Record<string, unknown>;
  if (item['Trash().bIsTrashed()'] === true || item['Withhold().bIsWithheld()'] === true) return;
  if (item['Game().name'] !== 'The Choicer Voicer') return;
  const sourceUrl = String(item['Url().sProfileUrl()'] || '');
  if (!/^https:\/\/(?:www\.)?gamebanana\.com\/mods\/\d+$/.test(sourceUrl)) return;
  return {
    id, title: String(item.name || `Pack ${id}`).slice(0, 180),
    creator: String(item['Owner().name'] || 'Unknown creator').slice(0, 80),
    category: String(item['RootCategory().name'] || 'Community pack').slice(0, 80),
    sourceUrl,
    imageUrl: /^https:\/\/images\.gamebanana\.com\//.test(String(item['Preview().sSubFeedImageUrl()'] || '')) ? String(item['Preview().sSubFeedImageUrl()']) : undefined,
    nsfw: item['Nsfw().bIsNsfw()'] === true,
  };
}
