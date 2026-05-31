/**
 * Room-name helpers for Socket.IO. Centralised so every emitter and
 * join handler agrees on the exact string — getting these out of sync
 * silently breaks fan-out without raising any type error.
 */

export function lobbyRoom(lobbyId: string): string {
  return `lobby:${lobbyId}`;
}

export function gameRoom(gameId: string): string {
  return `game:${gameId}`;
}
