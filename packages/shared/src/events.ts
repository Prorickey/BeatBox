import type { Track } from './types';

export const SocketEvents = {
  // Client -> Server
  JOIN_GUILD: 'guild:join',
  LEAVE_GUILD: 'guild:leave',
  PLAYER_PLAY: 'player:play',
  PLAYER_PAUSE: 'player:pause',
  PLAYER_RESUME: 'player:resume',
  PLAYER_SKIP: 'player:skip',
  PLAYER_PREVIOUS: 'player:previous',
  PLAYER_STOP: 'player:stop',
  PLAYER_SEEK: 'player:seek',
  PLAYER_VOLUME: 'player:volume',
  PLAYER_REPEAT: 'player:repeat',
  PLAYER_SHUFFLE: 'player:shuffle',
  QUEUE_ADD: 'queue:add',
  QUEUE_REMOVE: 'queue:remove',
  QUEUE_MOVE: 'queue:move',
  QUEUE_CLEAR: 'queue:clear',
  SEARCH: 'search:query',
  USER_VOICE_STATE: 'user:voiceState',
  AUTO_JOIN: 'guild:autoJoin',
  // Server -> Client
  PLAYER_STATE: 'player:state',
  PLAYER_ERROR: 'player:error',
  SEARCH_RESULTS: 'search:results',
  QUEUE_UPDATE: 'queue:update',
  USER_VOICE_STATE_RESULT: 'user:voiceStateResult',
  VOICE_STATE_CHANGED: 'voice:stateChanged',
} as const;

export interface SeekPayload {
  guildId: string;
  position: number;
}

export interface VolumePayload {
  guildId: string;
  volume: number;
}

export interface RepeatPayload {
  guildId: string;
  mode: 'off' | 'track' | 'queue';
}

export interface QueueAddPayload {
  guildId: string;
  query: string;
}

export interface QueueRemovePayload {
  guildId: string;
  position: number;
}

export interface QueueMovePayload {
  guildId: string;
  from: number;
  to: number;
}

export interface SearchPayload {
  guildId: string;
  query: string;
}

export interface SearchResult {
  tracks: Track[];
  source: string;
}

export interface PlayerErrorPayload {
  guildId: string;
  message: string;
  track?: Track;
}
