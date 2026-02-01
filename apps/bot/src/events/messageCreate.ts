import { Events, type Message } from "discord.js";
import type { BeatboxClient } from "../structures/Client";
import { prisma } from "@beatbox/database";
import { errorEmbed } from "../utils/embeds";
import { broadcastState } from "../handlers/socketHandler";
import { applyGuildSettings } from "../utils/guildSettings";
import {
  isSpotifyUrl,
  isSpotifyConfigured,
  parseSpotifyUrl,
  getSpotifyTracks,
  buildSearchQuery,
} from "../utils/spotify";

export const name = Events.MessageCreate;
export const once = false;

export async function execute(message: Message, client: BeatboxClient) {
  // Ignore bot messages
  if (message.author.bot) return;

  // Ignore DMs
  if (!message.guildId) return;

  // Check if this is a request channel
  const settings = await prisma.guildSettings.findFirst({
    where: { guildId: message.guildId },
  });

  if (!settings?.requestChannelId || settings.requestChannelId !== message.channelId) {
    return;
  }

  // This is a song request! Process it.
  const query = message.content.trim();

  if (!query) {
    // Empty message, just delete it
    await message.delete().catch(() => {});
    return;
  }

  // Delete the user's message after a short delay
  setTimeout(async () => {
    await message.delete().catch(() => {});
  }, 3000);

  // Check if user is in a voice channel
  const member = message.guild?.members.cache.get(message.author.id);
  const voiceChannel = member?.voice.channel;

  if (!voiceChannel) {
    const errorMsg = await message.channel.send({
      content: `${message.author}, you need to be in a voice channel to request songs!`,
    });
    setTimeout(async () => {
      await errorMsg.delete().catch(() => {});
    }, 5000);
    return;
  }

  try {
    // Cancel any pending disconnect timer
    const disconnectTimer = client.disconnectTimers.get(message.guildId);
    if (disconnectTimer) {
      clearTimeout(disconnectTimer);
      client.disconnectTimers.delete(message.guildId);
      console.log(`[requestchannel] Cancelled disconnect timer for guild ${message.guildId}`);
    }

    // Get or create player
    let player = client.kazagumo.players.get(message.guildId);
    if (!player) {
      player = await client.kazagumo.createPlayer({
        guildId: message.guildId,
        textId: message.channelId,
        voiceId: voiceChannel.id,
        volume: 80,
      });
      await applyGuildSettings(player, message.guildId);
    }

    // --- Spotify URL handling ---
    if (isSpotifyUrl(query)) {
      if (!isSpotifyConfigured()) {
        const errorMsg = await message.channel.send({
          content: `${message.author}, Spotify links aren't configured yet. Please use YouTube links or search terms instead.`,
        });
        setTimeout(async () => {
          await errorMsg.delete().catch(() => {});
        }, 5000);
        return;
      }

      const parsed = parseSpotifyUrl(query);
      if (!parsed) {
        const errorMsg = await message.channel.send({
          content: `${message.author}, couldn't parse that Spotify link.`,
        });
        setTimeout(async () => {
          await errorMsg.delete().catch(() => {});
        }, 5000);
        return;
      }

      console.log(`[requestchannel] Spotify ${parsed.type}: ${parsed.id}`);

      const spotify = await getSpotifyTracks(parsed.type, parsed.id);
      console.log(
        `[requestchannel] Fetched ${spotify.tracks.length} tracks from Spotify "${spotify.name}"`
      );

      if (spotify.tracks.length === 0) {
        const errorMsg = await message.channel.send({
          content: `${message.author}, no tracks found in that Spotify link.`,
        });
        setTimeout(async () => {
          await errorMsg.delete().catch(() => {});
        }, 5000);
        return;
      }

      // Send confirmation message
      const confirmMsg = await message.channel.send({
        content: `${message.author}, adding **${spotify.name}** (${spotify.tracks.length} tracks) to the queue...`,
      });

      // Search YouTube for each track and add to queue
      let added = 0;
      for (const spotifyTrack of spotify.tracks) {
        const searchQuery = buildSearchQuery(spotifyTrack);
        try {
          const result = await client.kazagumo.search(searchQuery, {
            requester: {
              id: message.author.id,
              username: message.author.username,
              avatar: message.author.displayAvatarURL(),
            },
          });

          if (result.tracks.length > 0) {
            player.queue.add(result.tracks[0]);
            added++;
            console.log(
              `[requestchannel] Spotify -> YT: "${searchQuery}" -> "${result.tracks[0].title}"`
            );
          } else {
            console.warn(`[requestchannel] Spotify -> YT: no results for "${searchQuery}"`);
          }
        } catch (err) {
          console.warn(`[requestchannel] Spotify -> YT: search failed for "${searchQuery}":`, err);
        }
      }

      console.log(
        `[requestchannel] Added ${added}/${spotify.tracks.length} Spotify tracks to queue`
      );

      // Update confirmation message
      await confirmMsg.edit({
        content: `${message.author}, added **${added}** tracks from **${spotify.name}** to the queue!`,
      });

      setTimeout(async () => {
        await confirmMsg.delete().catch(() => {});
      }, 5000);

      if (!player.playing && !player.paused) {
        player.play();
      }

      broadcastState(client, message.guildId);
      return;
    }

    // --- Normal search/URL handling ---
    console.log(`[requestchannel] Searching for: "${query}"`);
    const result = await client.kazagumo.search(query, {
      requester: {
        id: message.author.id,
        username: message.author.username,
        avatar: message.author.displayAvatarURL(),
      },
    });
    console.log(
      `[requestchannel] Search result: type=${result.type}, tracks=${result.tracks.length}`
    );

    if (!result.tracks.length) {
      console.warn(
        `[requestchannel] No tracks found for query: "${query}" (type: ${result.type})`
      );
      const errorMsg = await message.channel.send({
        content: `${message.author}, no results found for your search.`,
      });
      setTimeout(async () => {
        await errorMsg.delete().catch(() => {});
      }, 5000);
      return;
    }

    console.log(
      `[requestchannel] First track: "${result.tracks[0].title}" by ${result.tracks[0].author} (${result.tracks[0].sourceName})`
    );

    if (result.type === "PLAYLIST") {
      for (const track of result.tracks) {
        player.queue.add(track);
      }

      const confirmMsg = await message.channel.send({
        content: `${message.author}, added **${result.playlistName ?? "playlist"}** (${result.tracks.length} tracks) to the queue!`,
      });

      setTimeout(async () => {
        await confirmMsg.delete().catch(() => {});
      }, 5000);
    } else {
      const track = result.tracks[0];
      player.queue.add(track);

      const confirmMsg = await message.channel.send({
        content: `${message.author}, added **${track.title}** by **${track.author}** to the queue!`,
      });

      setTimeout(async () => {
        await confirmMsg.delete().catch(() => {});
      }, 5000);
    }

    if (!player.playing && !player.paused) {
      player.play();
    }

    broadcastState(client, message.guildId);
  } catch (error) {
    console.error("[requestchannel] Error processing request:", error);
    const errorMsg = await message.channel.send({
      content: `${message.author}, failed to add that track to the queue. Please try again!`,
    });
    setTimeout(async () => {
      await errorMsg.delete().catch(() => {});
    }, 5000);
  }
}
