import { readdir } from "fs/promises";
import { join } from "path";
import type { BeatboxClient } from "../structures/Client";
import { prisma } from "@beatbox/database";
import { broadcastState } from "./socketHandler";
import { EmbedBuilder, type TextBasedChannel } from "discord.js";
import { EMBED_COLORS, formatDuration, truncate } from "@beatbox/shared";

export async function loadEvents(client: BeatboxClient) {
  const eventsPath = join(import.meta.dir, "..", "events");
  const files = await readdir(eventsPath);
  const eventFiles = files.filter((f) => f.endsWith(".ts") || f.endsWith(".js"));

  for (const file of eventFiles) {
    const event = await import(join(eventsPath, file));
    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args, client));
    } else {
      client.on(event.name, (...args) => event.execute(...args, client));
    }
    console.log(`Loaded event: ${event.name}`);
  }

  // Kazagumo events
  client.kazagumo.shoukaku.on("ready", (name) =>
    console.log(`Lavalink node ${name} connected`)
  );
  client.kazagumo.shoukaku.on("error", (name, error) =>
    console.error(`Lavalink node ${name} error:`, error)
  );

  // Track play stats + broadcast state to dashboard + track history
  client.kazagumo.on("playerStart", async (_player, track) => {
    const guildId = _player.guildId;
    console.log(`[player] Started: "${track.title}" by ${track.author} in guild ${guildId} (pos: ${_player.position}, dur: ${track.length}ms)`);

    // Clear skip votes when a new track starts
    client.skipVotes.delete(guildId);

    // Track history for "previous" button
    const previousTrack = client.currentTrackRef.get(guildId);
    if (previousTrack && !client.goingPrevious.has(guildId)) {
      if (!client.previousTracks.has(guildId)) {
        client.previousTracks.set(guildId, []);
      }
      const history = client.previousTracks.get(guildId)!;
      history.push(previousTrack);
      if (history.length > 20) history.shift();
    }
    client.currentTrackRef.set(guildId, track);
    client.goingPrevious.delete(guildId);

    // Broadcast updated state to dashboard (track changed, queue shifted)
    broadcastState(client, guildId);

    const requester = track.requester as { id: string; username: string; avatar: string | null } | undefined;
    if (!requester) return;

    // Send now-playing announcement to text channel
    try {
      const settings = await prisma.guildSettings.findUnique({
        where: { guildId },
      });
      // Default to true if no settings record exists (matches schema default)
      const announceEnabled = settings ? settings.announceNowPlaying : true;

      // Don't announce autoplay tracks
      if (announceEnabled && requester.id !== "autoplay") {
        const channel = client.channels.cache.get(_player.textId) as TextBasedChannel | undefined;
        if (channel && "send" in channel) {
          const embed = new EmbedBuilder()
            .setColor(EMBED_COLORS.PRIMARY)
            .setAuthor({ name: "Now Playing 🎵" })
            .setTitle(truncate(track.title, 60))
            .setURL(track.uri ?? "")
            .setDescription(`by **${track.author}** — ${formatDuration(track.length ?? 0)}`)
            .setFooter({
              text: `Requested by ${requester.username}`,
              iconURL: requester.avatar ?? undefined,
            });

          if (track.thumbnail) {
            embed.setThumbnail(track.thumbnail);
          }

          await channel.send({ embeds: [embed] });
        }
      }
    } catch (err) {
      console.error("[announcements] Failed to send now-playing message:", err);
    }

    try {
      // Record the track play
      await prisma.trackPlay.create({
        data: {
          guildId,
          userId: requester.id,
          username: requester.username,
          title: track.title,
          author: track.author,
          uri: track.uri ?? "",
          sourceName: track.sourceName ?? "unknown",
          duration: track.length ?? 0,
        },
      });

      // Create or update session
      let sessionId = client.activeSessions.get(guildId);
      if (sessionId) {
        await prisma.listeningSession.update({
          where: { id: sessionId },
          data: { tracksPlayed: { increment: 1 } },
        });
      } else {
        const session = await prisma.listeningSession.create({
          data: { guildId, tracksPlayed: 1 },
        });
        client.activeSessions.set(guildId, session.id);
      }
    } catch (err) {
      console.error("[stats] Failed to record track play:", err);
    }
  });

  // Broadcast when queue empties + autoplay
  client.kazagumo.on("playerEmpty", async (_player) => {
    const guildId = _player.guildId;
    console.log(`[player] Queue empty in guild ${guildId} (playing: ${_player.playing}, paused: ${_player.paused}, pos: ${_player.position})`);
    broadcastState(client, guildId);

    // Autoplay: if enabled, search for a related track and play it
    try {
      const settings = await prisma.guildSettings.findUnique({
        where: { guildId },
      });
      // Default to true if no settings record exists (matches schema default)
      const autoPlayEnabled = settings ? settings.autoPlay : true;
      if (!autoPlayEnabled) return;

      const lastTrack = client.currentTrackRef.get(guildId);
      if (!lastTrack) return;

      const searchQuery = `${lastTrack.author} ${lastTrack.title}`;
      const result = await client.kazagumo.search(searchQuery, {
        requester: { id: "autoplay", username: "Autoplay", avatar: null },
      });

      // Pick a different track from results
      const candidates = result.tracks
        .filter((t) => t.uri !== lastTrack.uri)
        .slice(0, 5);
      if (candidates.length > 0) {
        const next =
          candidates[Math.floor(Math.random() * candidates.length)];
        console.log(`[autoplay] Playing next: "${next.title}" by ${next.author} (${candidates.length} candidates)`);
        _player.queue.add(next);
        _player.play();
        broadcastState(client, guildId);
      } else {
        console.log(`[autoplay] No candidates found for "${searchQuery}"`);
      }
    } catch (err) {
      console.error("[autoplay] Failed:", err);
    }
  });

  // End session on player destroy + broadcast to dashboard
  client.kazagumo.on("playerDestroy", async (_player) => {
    const guildId = _player.guildId;
    console.log(`[player] Destroyed in guild ${guildId}`);
    broadcastState(client, guildId);
    const sessionId = client.activeSessions.get(guildId);
    if (!sessionId) return;

    try {
      await prisma.listeningSession.update({
        where: { id: sessionId },
        data: { endedAt: new Date() },
      });
      client.activeSessions.delete(guildId);
    } catch (err) {
      console.error("[stats] Failed to end session:", err);
    }
  });
}
