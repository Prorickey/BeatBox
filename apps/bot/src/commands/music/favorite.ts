import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import type { BeatboxClient } from "../../structures/Client";
import { prisma } from "@beatbox/database";
import { errorEmbed, successEmbed } from "../../utils/embeds";
import { truncate } from "@beatbox/shared";

export const data = new SlashCommandBuilder()
  .setName("favorite")
  .setDescription("Save the currently playing track to your Favorites playlist");

export async function execute(
  interaction: ChatInputCommandInteraction,
  client: BeatboxClient
) {
  const player = client.kazagumo.players.get(interaction.guildId!);
  if (!player?.queue.current) {
    await interaction.reply({
      embeds: [errorEmbed("Nothing is currently playing.")],
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const userId = interaction.user.id;
  const track = player.queue.current;

  try {
    // Find or create the Favorites playlist
    let playlist = await prisma.playlist.findFirst({
      where: {
        userId,
        name: { equals: "Favorites", mode: "insensitive" },
      },
      include: { _count: { select: { tracks: true } } },
    });

    if (!playlist) {
      playlist = await prisma.playlist.create({
        data: {
          name: "Favorites",
          description: "Your favorite tracks",
          isPublic: false,
          userId,
        },
        include: { _count: { select: { tracks: true } } },
      });
    }

    // Check if this track is already in favorites
    const existing = await prisma.playlistTrack.findFirst({
      where: {
        playlistId: playlist.id,
        uri: track.uri ?? "",
      },
    });

    if (existing) {
      await interaction.editReply({
        embeds: [
          errorEmbed(`**${truncate(track.title, 50)}** is already in your Favorites.`),
        ],
      });
      return;
    }

    // Add track to favorites
    await prisma.playlistTrack.create({
      data: {
        playlistId: playlist.id,
        title: track.title,
        author: track.author,
        duration: track.length ?? 0,
        uri: track.uri ?? "",
        artworkUrl: track.thumbnail ?? null,
        sourceName: track.sourceName ?? "unknown",
        position: playlist._count.tracks,
      },
    });

    await interaction.editReply({
      embeds: [
        successEmbed(
          `Added **${truncate(track.title, 50)}** to your Favorites ❤️`
        ),
      ],
    });
  } catch (error) {
    console.error("Favorite command error:", error);
    await interaction.editReply({
      embeds: [errorEmbed("Failed to add track to your Favorites.")],
    });
  }
}
