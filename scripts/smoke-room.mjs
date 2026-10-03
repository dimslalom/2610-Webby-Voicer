const base = process.env.WEBBY_TEST_ORIGIN || 'http://127.0.0.1:8787';
const json = async (path, method = 'GET', body, token) => {
  const response = await fetch(`${base}${path}`, { method, headers: {
    'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, body: await response.json() };
};
const waitFor = async (check) => {
  for (let index = 0; index < 30; index++) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Room state did not update.');
};
const connect = (identity) => new Promise((resolve, reject) => {
  const ws = new WebSocket(`${base.replace(/^http/, 'ws')}/api/rooms/${identity.code}/ws?token=${identity.token}`);
  ws.onopen = () => resolve(ws);
  ws.onerror = reject;
});
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const created = await json('/api/rooms', 'POST', { name: 'Host' });
assert(created.status === 201 && created.body.code?.length === 6, 'create failed');
const { code, token: hostToken } = created.body;
const guest = await json(`/api/rooms/${code}/join`, 'POST', { name: 'Guest', kind: 'performer' });
assert(guest.status === 201, 'join failed');
const outsider = await json(`/api/rooms/${code}/state`);
assert(outsider.status === 401, 'private room state exposed');
const hostWs = await connect(created.body);
const guestWs = await connect(guest.body);
const pack = new Blob(['ZIP fixture'], { type: 'application/zip' });
const upload = await fetch(`${base}/api/rooms/${code}/pack`, { method: 'PUT', headers: { Authorization: `Bearer ${hostToken}` }, body: pack });
assert(upload.status === 200, 'pack upload failed');
hostWs.send(JSON.stringify({ type: 'packInfo', pack: { name: 'Demo', author: 'Test', lines: [{ id: 'line:0', character: 'Mina', caption: 'Hello', startsAt: 0.2 }] } }));
await waitFor(async () => (await json(`/api/rooms/${code}/state`, 'GET', undefined, hostToken)).body.room?.pack?.name === 'Demo');
guestWs.send(JSON.stringify({ type: 'claim', role: 'Mina' }));
await waitFor(async () => (await json(`/api/rooms/${code}/state`, 'GET', undefined, hostToken)).body.room?.assignments?.Mina === guest.body.id);
hostWs.send(JSON.stringify({ type: 'start' }));
await waitFor(async () => (await json(`/api/rooms/${code}/state`, 'GET', undefined, hostToken)).body.room?.phase === 'recording');
const denied = await fetch(`${base}/api/rooms/${code}/takes/${encodeURIComponent('line:0')}`, { method: 'PUT', headers: { Authorization: `Bearer ${hostToken}` }, body: new Blob(['wrong owner']) });
assert(denied.status === 403, 'wrong owner submitted a take');
const take = await fetch(`${base}/api/rooms/${code}/takes/${encodeURIComponent('line:0')}`, { method: 'PUT', headers: { Authorization: `Bearer ${guest.body.token}`, 'Content-Type': 'audio/webm' }, body: new Blob(['take audio']) });
assert(take.status === 200, 'assigned performer could not submit');
const heard = await fetch(`${base}/api/rooms/${code}/takes/${encodeURIComponent('line:0')}`, { headers: { Authorization: `Bearer ${hostToken}` } });
assert(heard.status === 200 && await heard.text() === 'take audio', 'host could not hear submitted take');
const state = (await json(`/api/rooms/${code}/state`, 'GET', undefined, guest.body.token)).body.room;
assert(state.participants.every((person) => !('token' in person)), 'participant token leaked');
hostWs.send(JSON.stringify({ type: 'showcase' }));
await waitFor(async () => (await json(`/api/rooms/${code}/state`, 'GET', undefined, hostToken)).body.room?.phase === 'showcase');
const showcase = (await json(`/api/rooms/${code}/state`, 'GET', undefined, hostToken)).body.room;
assert(showcase.showcaseAt > showcase.serverNow && showcase.showcaseAt - showcase.serverNow <= 5000, 'showcase start was not scheduled');
const end = await json(`/api/rooms/${code}/end`, 'POST', {}, hostToken);
assert(end.status === 200, 'room end failed');
const expired = await json(`/api/rooms/${code}/state`, 'GET', undefined, guest.body.token);
assert(expired.status === 404, 'ended room remained available');
hostWs.close(); guestWs.close();
console.log('Room create, join, roles, private state, pack transfer, take permission, playback transfer, and deletion passed.');
