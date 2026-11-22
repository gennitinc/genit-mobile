import { io, type Socket } from 'socket.io-client';

import { getAuthToken } from './api';
import { API_URL } from './config';

let socket: Socket | null = null;
let socketToken: string | null = null;

/** The server's origin: the API URL without `/api/v1/`. */
function socketOrigin() {
  return API_URL.replace(/\/api\/v1\/?$/, '');
}

/**
 * One shared connection, authenticated with the session token. Rooms are joined
 * by callers, which must re-join on `connect` because a reconnect drops them.
 */
export function getSocket() {
  const token = getAuthToken();
  if (!token) return null;
  if (socket && socketToken === token) return socket;

  socket?.disconnect();
  socketToken = token;
  socket = io(socketOrigin(), {
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
  });
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
  socketToken = null;
}
