export type RoomLine = { id: string; character: string; caption: string; startsAt: number };
export type RoomPack = { name: string; author: string; lines: RoomLine[] };
export type Participant = { id: string; name: string; token: string; kind: 'performer' | 'spectator'; joinedAt: number };
export type RoomState = {
  code: string;
  hostId: string;
  createdAt: number;
  expiresAt: number;
  phase: 'lobby' | 'recording' | 'showcase' | 'ended';
  locked: boolean;
  turnMode: 'turns' | 'simultaneous';
  currentLine: number;
  showcaseAt?: number;
  reactionsEnabled: boolean;
  votingEnabled: boolean;
  packReady: boolean;
  pack?: RoomPack;
  participants: Record<string, Participant>;
  assignments: Record<string, string>;
  takes: Record<string, { ownerId: string; at: number }>;
  votes: Record<string, string>;
  reactions: { from: string; emoji: string; at: number }[];
};

export function publicRoom(room: RoomState, online: Set<string>) {
  return {
    code: room.code, hostId: room.hostId, phase: room.phase, locked: room.locked,
    turnMode: room.turnMode, currentLine: room.currentLine, showcaseAt: room.showcaseAt, serverNow: Date.now(),
    reactionsEnabled: room.reactionsEnabled, votingEnabled: room.votingEnabled,
    packReady: room.packReady, pack: room.pack, assignments: room.assignments,
    takes: room.takes, votes: room.votingEnabled ? room.votes : {}, reactions: room.reactions.slice(-24),
    participants: Object.values(room.participants).map(({ token: _token, ...person }) => ({ ...person, online: online.has(person.id) })),
  };
}
