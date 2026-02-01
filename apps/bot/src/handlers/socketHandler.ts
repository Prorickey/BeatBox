import { SocketEvents } from "@beatbox/shared";
import type { BeatboxClient } from "../structures/Client";
import { getPlayerState } from "../utils/playerState";
import { applyGuildSettings } from "../utils/guildSettings";

export function setupSocketServer(client: BeatboxClient) {
  client.io.on("connection", (socket) => {
    console.log(`Dashboard client connected: ${socket.id}`);

    socket.on(SocketEvents.JOIN_GUILD, async (guildId: string) => {
      socket.join(`guild:${guildId}`);
      const state = getPlayerState(client, guildId);
      socket.emit(SocketEvents.PLAYER_STATE, state);
    });

    socket.on(SocketEvents.LEAVE_GUILD, (guildId: string) => {
      socket.leave(`guild:${guildId}`);
    });

    socket.on(SocketEvents.PLAYER_PAUSE, (guildId: string) => {
      const player = client.kazagumo.players.get(guildId);
      if (player) {
        player.pause(true);
        broadcastState(client, guildId);
      }
    });

    socket.on(SocketEvents.PLAYER_RESUME, (guildId: string) => {
      const player = client.kazagumo.players.get(guildId);
      if (player) {
        player.pause(false);
        broadcastState(client, guildId);
      }
    });

    socket.on(SocketEvents.PLAYER_SKIP, (guildId: string) => {
      const player = client.kazagumo.players.get(guildId);
      if (player) player.skip();
    });

    socket.on(SocketEvents.PLAYER_STOP, (guildId: string) => {
      const player = client.kazagumo.players.get(guildId);
      if (player) player.destroy();
    });

    socket.on(SocketEvents.PLAYER_VOLUME, ({ guildId, volume }: { guildId: string; volume: number }) => {
      const player = client.kazagumo.players.get(guildId);
      if (player) {
        player.setVolume(volume);
        broadcastState(client, guildId);
      }
    });

    socket.on(SocketEvents.PLAYER_SEEK, ({ guildId, position }: { guildId: string; position: number }) => {
      const player = client.kazagumo.players.get(guildId);
      if (player) {
        player.seek(position);
        // Delay broadcast — Lavalink needs time to process the seek,
        // otherwise player.position still returns the old value.
        // The client already shows the correct position via optimistic update.
        setTimeout(() => broadcastState(client, guildId), 500);
      }
    });

    socket.on(SocketEvents.QUEUE_REMOVE, ({ guildId, position }: { guildId: string; position: number }) => {
      const player = client.kazagumo.players.get(guildId);
      if (player) {
        player.queue.splice(position, 1);
        broadcastState(client, guildId);
      }
    });

    socket.on(SocketEvents.QUEUE_MOVE, ({ guildId, from, to }: { guildId: string; from: number; to: number }) => {
      const player = client.kazagumo.players.get(guildId);
      if (player && from >= 0 && to >= 0 && from < player.queue.length && to < player.queue.length) {
        const [track] = player.queue.splice(from, 1);
        player.queue.splice(to, 0, track);
        broadcastState(client, guildId);
      }
    });

    socket.on(SocketEvents.PLAYER_REPEAT, ({ guildId, mode }: { guildId: string; mode: string }) => {
      const player = client.kazagumo.players.get(guildId);
      if (player) {
        const kazagumoMode = mode === "off" ? "none" : mode;
        player.setLoop(kazagumoMode as any);
        broadcastState(client, guildId);
      }
    });

    socket.on(SocketEvents.PLAYER_SHUFFLE, (guildId: string) => {
      const player = client.kazagumo.players.get(guildId);
      if (player && player.queue.length > 1) {
        // Fisher-Yates shuffle on the queue
        for (let i = player.queue.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          const temp = player.queue[i];
          player.queue[i] = player.queue[j];
          player.queue[j] = temp;
        }
        broadcastState(client, guildId);
      }
    });

    socket.on(SocketEvents.PLAYER_PREVIOUS, (guildId: string) => {
      const player = client.kazagumo.players.get(guildId);
      if (!player) return;

      const history = client.previousTracks.get(guildId);
      if (!history || history.length === 0) return;

      const previousTrack = history.pop()!;

      // Set flag so playerStart doesn't add current to history
      client.goingPrevious.add(guildId);

      // Push current track back to front of queue
      if (player.queue.current) {
        player.queue.splice(0, 0, player.queue.current);
      }

      // Insert previous track at front of queue and skip to it
      player.queue.splice(0, 0, previousTrack);
      player.skip();
    });

    socket.on(SocketEvents.QUEUE_CLEAR, (guildId: string) => {
      const player = client.kazagumo.players.get(guildId);
      if (player) {
        player.queue.clear();
        broadcastState(client, guildId);
      }
    });

    socket.on(SocketEvents.QUEUE_ADD, async ({ guildId, query }: { guildId: string; query: string }) => {
      let player = client.kazagumo.players.get(guildId);

      // If a player exists but the bot isn't actually in a voice channel, destroy the stale player
      if (player) {
        const guild = client.guilds.cache.get(guildId);
        const botVoice = guild?.members.cache.get(client.user!.id)?.voice;
        if (!botVoice?.channelId) {
          const timer = client.disconnectTimers.get(guildId);
          if (timer) {
            clearTimeout(timer);
            client.disconnectTimers.delete(guildId);
          }
          player.destroy();
          player = undefined;
        }
      }

      if (!player) {
        // No player — try to create one by finding an occupied voice channel
        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
          socket.emit(SocketEvents.PLAYER_ERROR, { guildId, message: "Guild not found" });
          return;
        }
        const voiceChannel = guild.channels.cache.find(
          (ch) => ch.isVoiceBased() && ch.members.some((m) => !m.user.bot)
        );
        if (!voiceChannel) {
          socket.emit(SocketEvents.PLAYER_ERROR, { guildId, message: "No one is in a voice channel" });
          return;
        }
        // Find a text channel for announcements
        const textChannel = guild.channels.cache.find(
          (ch) => ch.isTextBased() && !ch.isVoiceBased()
        );
        player = await client.kazagumo.createPlayer({
          guildId,
          textId: textChannel?.id ?? voiceChannel.id,
          voiceId: voiceChannel.id,
          volume: 80,
        });
        await applyGuildSettings(player, guildId);
      }
      try {
        const result = await client.kazagumo.search(query, {
          requester: { id: "dashboard", username: "Dashboard", avatar: null },
        });
        if (result.tracks.length > 0) {
          player.queue.add(result.tracks[0]);
          if (!player.playing && !player.paused) {
            player.play();
          }
          broadcastState(client, guildId);
        } else {
          socket.emit(SocketEvents.PLAYER_ERROR, { guildId, message: "No results found" });
        }
      } catch {
        socket.emit(SocketEvents.PLAYER_ERROR, { guildId, message: "Failed to add track" });
      }
    });

    socket.on(SocketEvents.SEARCH, async ({ guildId, query }: { guildId: string; query: string }) => {
      try {
        const result = await client.kazagumo.search(query);
        socket.emit(SocketEvents.SEARCH_RESULTS, {
          tracks: result.tracks.map((t) => ({
            id: t.identifier,
            title: t.title,
            author: t.author,
            duration: t.length,
            uri: t.uri,
            artworkUrl: t.thumbnail,
            sourceName: t.sourceName,
          })),
          source: result.type,
        });
      } catch {
        socket.emit(SocketEvents.PLAYER_ERROR, {
          guildId,
          message: "Search failed",
        });
      }
    });

    socket.on(SocketEvents.USER_VOICE_STATE, (userId: string) => {
      const result: { guildId: string; channelId: string; guildName: string } | null = null;
      for (const [guildId, guild] of client.guilds.cache) {
        const voiceState = guild.voiceStates.cache.get(userId);
        if (voiceState?.channelId) {
          socket.emit(SocketEvents.USER_VOICE_STATE_RESULT, {
            guildId,
            channelId: voiceState.channelId,
            guildName: guild.name,
          });
          return;
        }
      }
      socket.emit(SocketEvents.USER_VOICE_STATE_RESULT, null);
    });

    socket.on(SocketEvents.AUTO_JOIN, async ({ guildId, userId }: { guildId: string; userId: string }) => {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) return;

      const member = guild.members.cache.get(userId) ?? await guild.members.fetch(userId).catch(() => null);
      if (!member?.voice.channelId) return;

      let player = client.kazagumo.players.get(guildId);

      // If a player exists but the bot isn't actually in a voice channel, destroy the stale player
      if (player) {
        const botVoice = guild.members.cache.get(client.user!.id)?.voice;
        if (!botVoice?.channelId) {
          const timer = client.disconnectTimers.get(guildId);
          if (timer) {
            clearTimeout(timer);
            client.disconnectTimers.delete(guildId);
          }
          player.destroy();
          player = undefined;
        }
      }

      if (!player) {
        const textChannel = guild.channels.cache.find(
          (ch) => ch.isTextBased() && !ch.isVoiceBased()
        );

        player = await client.kazagumo.createPlayer({
          guildId,
          textId: textChannel?.id ?? member.voice.channelId,
          voiceId: member.voice.channelId,
          volume: 80,
        });
        await applyGuildSettings(player, guildId);
      }

      broadcastState(client, guildId);
    });

    socket.on("disconnect", () => {
      console.log(`Dashboard client disconnected: ${socket.id}`);
    });
  });
}

export function broadcastState(client: BeatboxClient, guildId: string) {
  const state = getPlayerState(client, guildId);
  client.io.to(`guild:${guildId}`).emit(SocketEvents.PLAYER_STATE, state);
}
