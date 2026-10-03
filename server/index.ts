import { DurableObject } from 'cloudflare:workers';
import type { RoomPack, RoomState } from './types';
import { publicRoom } from './types';
import { market } from './market';

export interface Env {
  ROOMS: DurableObjectNamespace<Room>;
  ROOM_MEDIA: R2Bucket;
  ASSETS: Fetcher;
}

const roomLifeMs = 3 * 60 * 60 * 1000;
const codeAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function code(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (byte) => codeAlphabet[byte % codeAlphabet.length]).join('');
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
}

function fail(message: string, status = 400): Response { return json({ error: message }, status); }

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') return json({ ok: true });
    if (url.pathname === '/api/market' && request.method === 'GET') return market(request);
    if (url.pathname === '/api/rooms' && request.method === 'POST') {
      for (let attempt = 0; attempt < 5; attempt++) {
        const roomCode = code();
        const stub = env.ROOMS.getByName(roomCode);
        const createUrl = new URL(`/api/rooms/${roomCode}/create`, url);
        const response = await stub.fetch(new Request(createUrl, request));
        if (response.status !== 409) return response;
      }
      return fail('Could not reserve a room code. Try again.', 503);
    }
    const match = url.pathname.match(/^\/api\/rooms\/([A-Z2-9]{6})(?:\/|$)/);
    if (match) return env.ROOMS.getByName(match[1]).fetch(request);
    if (url.pathname.startsWith('/api/')) return fail('API route not found.', 404);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

export class Room extends DurableObject<Env> {
  private async read(): Promise<RoomState | undefined> { return this.ctx.storage.get<RoomState>('room'); }
  private async save(room: RoomState): Promise<void> {
    room.expiresAt = Date.now() + roomLifeMs;
    await this.ctx.storage.put('room', room);
    await this.ctx.storage.setAlarm(room.expiresAt);
    this.broadcast(room);
  }
  private online(): Set<string> {
    return new Set(this.ctx.getWebSockets().map((socket) => socket.deserializeAttachment() as string).filter(Boolean));
  }
  private broadcast(room: RoomState): void {
    const payload = JSON.stringify({ type: 'state', room: publicRoom(room, this.online()) });
    for (const socket of this.ctx.getWebSockets()) {
      try { socket.send(payload); } catch { /* disconnected during broadcast */ }
    }
  }
  private member(room: RoomState, request: Request) {
    const url = new URL(request.url);
    const token = request.headers.get('Authorization')?.replace(/^Bearer /i, '') || url.searchParams.get('token');
    return Object.values(room.participants).find((person) => person.token === token);
  }
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean);
    const roomCode = parts[2];
    const action = parts[3];
    let room = await this.read();
    if (action === 'create' && request.method === 'POST') {
      if (room) return fail('Room code is already in use.', 409);
      const body = await request.json().catch(() => ({})) as { name?: string };
      const id = crypto.randomUUID();
      const token = crypto.randomUUID();
      room = {
        code: roomCode, hostId: id, createdAt: Date.now(), expiresAt: Date.now() + roomLifeMs,
        phase: 'lobby', locked: false, turnMode: 'turns', currentLine: 0,
        reactionsEnabled: true, votingEnabled: false, packReady: false,
        participants: { [id]: { id, name: cleanName(body.name), token, kind: 'performer', joinedAt: Date.now() } },
        assignments: {}, takes: {}, votes: {}, reactions: [],
      };
      await this.save(room);
      return json({ code: roomCode, id, token, room: publicRoom(room, new Set()) }, 201);
    }
    if (!room || room.phase === 'ended') return fail('This room has ended or does not exist.', 404);
    if (action === 'join' && request.method === 'POST') {
      if (room.locked || room.phase !== 'lobby') return fail('This room is closed to new players.', 403);
      const body = await request.json().catch(() => ({})) as { name?: string; kind?: string };
      const performers = Object.values(room.participants).filter((person) => person.kind === 'performer').length;
      const spectators = Object.values(room.participants).filter((person) => person.kind === 'spectator').length;
      const kind = body.kind === 'spectator' || performers >= 8 ? 'spectator' : 'performer';
      if (kind === 'spectator' && spectators >= 32) return fail('The spectator seats are full.', 403);
      const id = crypto.randomUUID();
      const token = crypto.randomUUID();
      room.participants[id] = { id, token, name: cleanName(body.name), kind, joinedAt: Date.now() };
      await this.save(room);
      return json({ code: roomCode, id, token, room: publicRoom(room, this.online()) }, 201);
    }
    const person = this.member(room, request);
    if (!person) return fail('Join the room to continue.', 401);
    if (action === 'state' && request.method === 'GET') return json({ room: publicRoom(room, this.online()) });
    if (action === 'ws' && request.method === 'GET') {
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return fail('Expected WebSocket upgrade.', 426);
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment(person.id);
      server.send(JSON.stringify({ type: 'state', room: publicRoom(room, this.online()) }));
      this.broadcast(room);
      return new Response(null, { status: 101, webSocket: client });
    }
    if (action === 'pack') {
      const key = `rooms/${room.code}/pack.zip`;
      if (request.method === 'PUT') {
        if (person.id !== room.hostId || room.phase !== 'lobby') return fail('Only the host can share a pack before the game starts.', 403);
        if (!request.body || tooLarge(request, 100_000_000)) return fail('Pack must be under 100 MB.', 413);
        await this.env.ROOM_MEDIA.put(key, request.body, { httpMetadata: { contentType: 'application/zip' } });
        room.packReady = true;
        await this.save(room);
        return json({ ok: true });
      }
      if (request.method === 'GET' && room.packReady) return mediaResponse(await this.env.ROOM_MEDIA.get(key), 'application/zip');
    }
    if (action === 'takes' && parts[4]) {
      const lineId = decodeURIComponent(parts.slice(4).join('/'));
      const line = room.pack?.lines.find((item) => item.id === lineId);
      if (!line) return fail('Line not found.', 404);
      const key = `rooms/${room.code}/takes/${encodeURIComponent(lineId)}`;
      if (request.method === 'PUT') {
        if (room.phase !== 'recording' || person.kind !== 'performer' || room.assignments[line.character] !== person.id) return fail('This line is not assigned to you.', 403);
        if (room.turnMode === 'turns' && room.pack?.lines[room.currentLine]?.id !== lineId) return fail('Wait for the current line.', 403);
        if (!request.body || tooLarge(request, 15_000_000)) return fail('Take must be under 15 MB.', 413);
        await this.env.ROOM_MEDIA.put(key, request.body, { httpMetadata: { contentType: request.headers.get('Content-Type') || 'audio/webm' } });
        room.takes[lineId] = { ownerId: person.id, at: Date.now() };
        await this.save(room);
        return json({ ok: true });
      }
      if (request.method === 'GET' && room.takes[lineId]) return mediaResponse(await this.env.ROOM_MEDIA.get(key), 'audio/webm');
    }
    if (action === 'end' && request.method === 'POST') {
      if (person.id !== room.hostId) return fail('Only the host can end the room.', 403);
      await this.end(room);
      return json({ ok: true });
    }
    return fail('Room route not found.', 404);
  }
  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const room = await this.read();
    const personId = socket.deserializeAttachment() as string;
    const person = room?.participants[personId];
    if (!room || !person || room.phase === 'ended' || typeof message !== 'string' || message.length > 20_000) return;
    let input: Record<string, unknown>;
    try { input = JSON.parse(message) as Record<string, unknown>; } catch { return; }
    const host = personId === room.hostId;
    const roles = new Set(room.pack?.lines.map((line) => line.character) || []);
    if (input.type === 'claim' && room.phase === 'lobby' && person.kind === 'performer' && typeof input.role === 'string' && roles.has(input.role)) {
      const current = room.assignments[input.role];
      if (!current || current === personId) room.assignments[input.role] = personId;
    } else if (input.type === 'assign' && host && room.phase === 'lobby' && typeof input.role === 'string' && roles.has(input.role)) {
      const target = String(input.personId || '');
      if (!target) delete room.assignments[input.role];
      else if (room.participants[target]?.kind === 'performer') room.assignments[input.role] = target;
    } else if (input.type === 'settings' && host && room.phase === 'lobby') {
      if (input.turnMode === 'turns' || input.turnMode === 'simultaneous') room.turnMode = input.turnMode;
      if (typeof input.locked === 'boolean') room.locked = input.locked;
      if (typeof input.votingEnabled === 'boolean') room.votingEnabled = input.votingEnabled;
      if (typeof input.reactionsEnabled === 'boolean') room.reactionsEnabled = input.reactionsEnabled;
    } else if (input.type === 'packInfo' && host && room.phase === 'lobby' && room.packReady && validPack(input.pack)) {
      room.pack = input.pack;
      room.assignments = {};
      room.takes = {};
    } else if (input.type === 'start' && host && room.phase === 'lobby' && room.pack?.lines.length) {
      room.phase = 'recording';
      room.currentLine = 0;
    } else if (input.type === 'advance' && host && room.phase === 'recording') {
      room.currentLine = Math.min(room.currentLine + 1, Math.max(0, (room.pack?.lines.length || 1) - 1));
    } else if (input.type === 'showcase' && host && room.phase === 'recording') {
      room.phase = 'showcase';
      room.showcaseAt = Date.now() + 5000;
    } else if (input.type === 'reaction' && room.reactionsEnabled && room.phase === 'showcase' && typeof input.emoji === 'string' && ['👏', '😂', '❤️', '🔥'].includes(input.emoji)) {
      room.reactions.push({ from: personId, emoji: input.emoji, at: Date.now() });
      room.reactions = room.reactions.slice(-24);
    } else if (input.type === 'vote' && room.votingEnabled && room.phase === 'showcase' && typeof input.personId === 'string' && room.participants[input.personId]?.kind === 'performer') {
      room.votes[personId] = input.personId;
    } else return;
    await this.save(room);
  }
  async webSocketClose(socket: WebSocket): Promise<void> {
    const room = await this.read();
    if (room) this.broadcast(room);
    socket.close();
  }
  async alarm(): Promise<void> {
    const room = await this.read();
    if (room && room.expiresAt <= Date.now()) await this.end(room);
    else if (room) await this.ctx.storage.setAlarm(room.expiresAt);
  }
  private async end(room: RoomState): Promise<void> {
    room.phase = 'ended';
    const keys = [`rooms/${room.code}/pack.zip`, ...Object.keys(room.takes).map((id) => `rooms/${room.code}/takes/${encodeURIComponent(id)}`)];
    await Promise.all(keys.map((key) => this.env.ROOM_MEDIA.delete(key)));
    room.packReady = false;
    room.takes = {};
    await this.ctx.storage.put('room', room);
    this.broadcast(room);
    for (const socket of this.ctx.getWebSockets()) socket.close(1000, 'Room ended');
  }
}

function cleanName(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, 32) || 'Guest' : 'Guest';
}
function tooLarge(request: Request, limit: number): boolean {
  const header = request.headers.get('Content-Length');
  const size = Number(header);
  return !header || !Number.isFinite(size) || size <= 0 || size > limit;
}
function validPack(value: unknown): value is RoomPack {
  if (!value || typeof value !== 'object') return false;
  const pack = value as Partial<RoomPack>;
  return typeof pack.name === 'string' && pack.name.length <= 100 && typeof pack.author === 'string' && pack.author.length <= 100
    && Array.isArray(pack.lines) && pack.lines.length > 0 && pack.lines.length <= 500
    && pack.lines.every((line) => typeof line.id === 'string' && line.id.length <= 200 && typeof line.character === 'string' && line.character.length <= 60 && typeof line.caption === 'string' && line.caption.length <= 500 && Number.isFinite(line.startsAt) && line.startsAt >= 0);
}
function mediaResponse(object: R2ObjectBody | null, type: string): Response {
  if (!object) return fail('Media has expired.', 404);
  return new Response(object.body, { headers: { 'Content-Type': object.httpMetadata?.contentType || type, 'Cache-Control': 'private, no-store' } });
}
