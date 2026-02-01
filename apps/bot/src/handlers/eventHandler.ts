import { readdir } from "fs/promises";
import { join } from "path";
import type { BeatboxClient } from "../structures/Client";
import { prisma } from "@beatbox/database";
import { broadcastState } from "./socketHandler";
import { EmbedBuilder, type TextBasedChannel } from "discord.js";
import { EMBED_COLORS, formatDuration, truncate } from "@beatbox/shared";
import { playerButtons } from "../utils/embeds";
import type { KazagumoTrack } from "kazagumo";

/**
 * Update the persistent player embed in the request channel (if configured)
 */
export async function updateRequestChannelEmbed(
  client: BeatboxClient,
  guildId: string,
  track: KazagumoTrack | null,
  paused: boolean = false
) {
  try {
    const settings = await prisma.guildSettings.findFirst({
      where: { guildId },
    });

    if (!settings?.requestChannelId || !settings.requestMessageId) {
      return; // No request channel configured
    }

    const channel = await client.channels.fetch(settings.requestChannelId);
    if (!channel?.isTextBased()) return;

    const message = await channel.messages.fetch(settings.requestMessageId);
    if (!message) return;

    let embed: EmbedBuilder;

    if (track) {
      const requester = track.requester as
        | { id: string; username: string; avatar: string | null }
        | undefined;

      embed = new EmbedBuilder()
        .setColor(EMBED_COLORS.PRIMARY)
        .setAuthor({ name: "🎵 Song Request Channel" })
        .setTitle(truncate(track.title, 60))
        .setURL(track.uri ?? "")
        .setDescription(
          [
            `by **${track.author}** — ${formatDuration(track.length ?? 0)}`,
            "",
            "**How to use:**",
            "Simply type a song name or URL in this channel to queue it!",
          ].join("\n")
        );

      if (requester) {
        embed.setFooter({
          text: `Requested by ${requester.username}`,
          iconURL: requester.avatar ?? undefined,
        });
      }

      if (track.thumbnail) {
        embed.setThumbnail(track.thumbnail);
      }
    } else {
      // No track playing
      embed = new EmbedBuilder()
        .setColor(EMBED_COLORS.PRIMARY)
        .setAuthor({ name: "🎵 Song Request Channel" })
        .setTitle("No track playing")
        .setDescription(
          [
            "**How to use:**",
            "Simply type a song name or URL in this channel to queue it!",
            "",
            "Supported sources: YouTube, Spotify, SoundCloud, and more.",
            "",
            "Use the buttons below to control playback.",
          ].join("\n")
        )
        .setFooter({ text: "Your messages will be automatically deleted" });
    }

    await message.edit({
      embeds: [embed],
      components: [playerButtons(paused)],
    });
  } catch (error) {
    console.warn("[requestchannel] Failed to update persistent embed:", error);
  }
}

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

    // Cache current queue state for re-queue feature
    client.lastQueueCache.set(guildId, {
      current: track,
      tracks: [..._player.queue],
    });

    // Broadcast updated state to dashboard (track changed, queue shifted)
    broadcastState(client, guildId);

    // Update request channel embed if configured
    await updateRequestChannelEmbed(client, guildId, track, _player.paused);

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

    // Update request channel embed to show "No track playing"
    await updateRequestChannelEmbed(client, guildId, null, false);

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

    // Update request channel embed to show "No track playing"
    await updateRequestChannelEmbed(client, guildId, null, false);

    // Persist the last queue state to database for /requeue
    const cachedQueue = client.lastQueueCache.get(guildId);
    if (cachedQueue && (cachedQueue.current || cachedQueue.tracks.length > 0)) {
      try {
        const allTracks = [];
        if (cachedQueue.current) {
          allTracks.push({
            title: cachedQueue.current.title,
            author: cachedQueue.current.author,
            duration: cachedQueue.current.length ?? 0,
            uri: cachedQueue.current.uri ?? "",
            artworkUrl: cachedQueue.current.thumbnail ?? null,
            sourceName: cachedQueue.current.sourceName ?? "unknown",
            position: 0,
            wasPlaying: true,
          });
        }

        cachedQueue.tracks.forEach((track, index) => {
          allTracks.push({
            title: track.title,
            author: track.author,
            duration: track.length ?? 0,
            uri: track.uri ?? "",
            artworkUrl: track.thumbnail ?? null,
            sourceName: track.sourceName ?? "unknown",
            position: index + 1,
            wasPlaying: false,
          });
        });

        if (allTracks.length > 0) {
          await prisma.lastQueue.upsert({
            where: { guildId },
            create: {
              guildId,
              tracks: { create: allTracks },
            },
            update: {
              tracks: {
                deleteMany: {},
                create: allTracks,
              },
              savedAt: new Date(),
            },
          });
          console.log(`[requeue] Saved ${allTracks.length} tracks for guild ${guildId}`);
        }
      } catch (err) {
        console.error("[requeue] Failed to persist queue:", err);
      }

      client.lastQueueCache.delete(guildId);
    }

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
