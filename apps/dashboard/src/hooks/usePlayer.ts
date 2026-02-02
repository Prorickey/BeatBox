"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { getSocket } from "@/lib/socket";
import { SocketEvents, type PlayerState } from "@beatbox/shared";

const defaultState: PlayerState = {
  guildId: "",
  playing: false,
  paused: false,
  currentTrack: null,
  position: 0,
  volume: 80,
  repeatMode: "off",
  queue: [],
};

// Grace period after an optimistic action where we ignore stale server updates.
// Server updates arriving during this window are buffered; once it expires,
// the latest buffered state is applied to reconcile with the server.
const RECONCILE_DELAY = 800;

export function usePlayer(guildId: string) {
  const [state, setState] = useState<PlayerState>(defaultState);
  const socket = getSocket();

  const lastActionRef = useRef(0);
  const bufferedStateRef = useRef<PlayerState | null>(null);
  const reconcileTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Apply an optimistic update and schedule reconciliation
  const optimistic = useCallback(
    (updater: (prev: PlayerState) => PlayerState) => {
      lastActionRef.current = Date.now();
      bufferedStateRef.current = null;
      setState(updater);

      // Schedule reconciliation: after the grace period, apply the latest
      // server state we received (if any) to correct any prediction drift.
      clearTimeout(reconcileTimerRef.current);
      reconcileTimerRef.current = setTimeout(() => {
        lastActionRef.current = 0;
        if (bufferedStateRef.current) {
          setState(bufferedStateRef.current);
          bufferedStateRef.current = null;
        }
      }, RECONCILE_DELAY);
    },
    []
  );

  useEffect(() => {
    socket.emit(SocketEvents.JOIN_GUILD, guildId);

    const handleState = (newState: PlayerState) => {
      if (Date.now() - lastActionRef.current < RECONCILE_DELAY) {
        // Within grace period — buffer this update for later reconciliation
        bufferedStateRef.current = newState;
        return;
      }
      setState(newState);
    };

    socket.on(SocketEvents.PLAYER_STATE, handleState);
    socket.on(SocketEvents.QUEUE_UPDATE, handleState);

    return () => {
      socket.emit(SocketEvents.LEAVE_GUILD, guildId);
      socket.off(SocketEvents.PLAYER_STATE, handleState);
      socket.off(SocketEvents.QUEUE_UPDATE, handleState);
      clearTimeout(reconcileTimerRef.current);
    };
  }, [guildId, socket]);

  // --- Actions with client-side prediction ---

  const pause = useCallback(() => {
    optimistic((prev) => ({ ...prev, paused: true }));
    socket.emit(SocketEvents.PLAYER_PAUSE, guildId);
  }, [guildId, socket, optimistic]);

  const resume = useCallback(() => {
    optimistic((prev) => ({ ...prev, paused: false }));
    socket.emit(SocketEvents.PLAYER_RESUME, guildId);
  }, [guildId, socket, optimistic]);

  const skip = useCallback(() => {
    optimistic((prev) => {
      if (prev.repeatMode === "track") {
        // Track loop — same track restarts
        return { ...prev, position: 0, playing: true, paused: false };
      }
      if (prev.queue.length > 0) {
        const [nextTrack, ...rest] = prev.queue;
        return {
          ...prev,
          currentTrack: nextTrack,
          queue: rest.map((t, i) => ({ ...t, position: i })),
          position: 0,
          playing: true,
          paused: false,
        };
      }
      // Queue empty — playback stops
      return {
        ...prev,
        currentTrack: null,
        queue: [],
        position: 0,
        playing: false,
        paused: false,
      };
    });
    socket.emit(SocketEvents.PLAYER_SKIP, guildId);
  }, [guildId, socket, optimistic]);

  const stop = useCallback(() => {
    optimistic((prev) => ({
      ...prev,
      currentTrack: null,
      queue: [],
      position: 0,
      playing: false,
      paused: false,
    }));
    socket.emit(SocketEvents.PLAYER_STOP, guildId);
  }, [guildId, socket, optimistic]);

  const setVolume = useCallback(
    (volume: number) => {
      optimistic((prev) => ({ ...prev, volume }));
      socket.emit(SocketEvents.PLAYER_VOLUME, { guildId, volume });
    },
    [guildId, socket, optimistic]
  );

  const seek = useCallback(
    (position: number) => {
      optimistic((prev) => ({ ...prev, position }));
      socket.emit(SocketEvents.PLAYER_SEEK, { guildId, position });
    },
    [guildId, socket, optimistic]
  );

  const removeTrack = useCallback(
    (position: number) => {
      optimistic((prev) => ({
        ...prev,
        queue: prev.queue
          .filter((_, i) => i !== position)
          .map((t, i) => ({ ...t, position: i })),
      }));
      socket.emit(SocketEvents.QUEUE_REMOVE, { guildId, position });
    },
    [guildId, socket, optimistic]
  );

  const clearQueue = useCallback(() => {
    optimistic((prev) => ({ ...prev, queue: [] }));
    socket.emit(SocketEvents.QUEUE_CLEAR, guildId);
  }, [guildId, socket, optimistic]);

  const shuffle = useCallback(() => {
    optimistic((prev) => {
      const shuffled = [...prev.queue];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return {
        ...prev,
        queue: shuffled.map((t, i) => ({ ...t, position: i })),
      };
    });
    socket.emit(SocketEvents.PLAYER_SHUFFLE, guildId);
  }, [guildId, socket, optimistic]);

  const setRepeat = useCallback(
    (mode: "off" | "track" | "queue") => {
      optimistic((prev) => ({ ...prev, repeatMode: mode }));
      socket.emit(SocketEvents.PLAYER_REPEAT, { guildId, mode });
    },
    [guildId, socket, optimistic]
  );

  const previous = useCallback(() => {
    // We can't predict the previous track (history is server-side),
    // so just emit and let the server broadcast the result.
    socket.emit(SocketEvents.PLAYER_PREVIOUS, guildId);
  }, [guildId, socket]);

  const moveTrack = useCallback(
    (from: number, to: number) => {
      optimistic((prev) => {
        const newQueue = [...prev.queue];
        const [moved] = newQueue.splice(from, 1);
        newQueue.splice(to, 0, moved);
        return {
          ...prev,
          queue: newQueue.map((t, i) => ({ ...t, position: i })),
        };
      });
      socket.emit(SocketEvents.QUEUE_MOVE, { guildId, from, to });
    },
    [guildId, socket, optimistic]
  );

  return {
    state,
    pause,
    resume,
    skip,
    previous,
    stop,
    setVolume,
    seek,
    removeTrack,
    clearQueue,
    shuffle,
    setRepeat,
    moveTrack,
  };
}
