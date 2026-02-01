import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import type { BeatboxClient } from "../../structures/Client";
import { prisma } from "@beatbox/database";
import {
  EMBED_COLORS,
  formatDuration,
  truncate,
} from "@beatbox/shared";
import { errorEmbed, successEmbed } from "../../utils/embeds";
import { broadcastState } from "../../handlers/socketHandler";
import { applyGuildSettings } from "../../utils/guildSettings";

export const data = new SlashCommandBuilder()
  .setName("favorites")
  .setDescription("Manage your favorite tracks")
  .addSubcommand((sub) =>
    sub
      .setName("list")
      .setDescription("Show your favorite tracks")
      .addIntegerOption((opt) =>
        opt
          .setName("page")
          .setDescription("Page number (default 1)")
          .setRequired(false)
          .setMinValue(1)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("play")
      .setDescription("Load all your favorites into the queue and start playing")
  )
  .addSubcommand((sub) =>
    sub
      .setName("remove")
      .setDescription("Remove a track from your favorites")
      .addIntegerOption((opt) =>
        opt
          .setName("position")
          .setDescription("Track number to remove")
          .setRequired(true)
          .setMinValue(1)
      )
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
  client: BeatboxClient
) {
  const sub = interaction.options.getSubcommand();
  const userId = interaction.user.id;

  switch (sub) {
    case "list":
      return handleList(interaction, userId);
    case "play":
      return handlePlay(interaction, client, userId);
    case "remove":
      return handleRemove(interaction, userId);
  }
}

async function handleList(
  interaction: ChatInputCommandInteraction,
  userId: string
) {
  const page = (interaction.options.getInteger("page") ?? 1) - 1;

  const playlist = await prisma.playlist.findFirst({
    where: {
      userId,
      name: { equals: "Favorites", mode: "insensitive" },
    },
    include: { tracks: { orderBy: { position: "asc" } } },
  });

  if (!playlist || playlist.tracks.length === 0) {
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(EMBED_COLORS.PRIMARY)
          .setAuthor({ name: "Your Favorites ❤️" })
          .setDescription(
            "You don't have any favorite tracks yet.\nUse `/favorite` to add the currently playing track!"
          ),
      ],
      ephemeral: true,
    });
    return;
  }

  const tracksPerPage = 20;
  const totalPages = Math.ceil(playlist.tracks.length / tracksPerPage);
  const clampedPage = Math.max(0, Math.min(page, totalPages - 1));

  const pageTracks = playlist.tracks.slice(
    clampedPage * tracksPerPage,
    (clampedPage + 1) * tracksPerPage
  );

  const totalDuration = playlist.tracks.reduce((s, t) => s + t.duration, 0);
  const trackList = pageTracks
    .map(
      (t, i) =>
        `\`${(clampedPage * tracksPerPage + i + 1).toString().padStart(2, " ")}.\` [${truncate(t.title, 40)}](${t.uri}) — ${formatDuration(t.duration)}`
    )
    .join("\n");

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(EMBED_COLORS.PRIMARY)
        .setAuthor({ name: "Your Favorites ❤️" })
        .setDescription(trackList)
        .setFooter({
          text: `${playlist.tracks.length} tracks · ${formatDuration(totalDuration)} · Page ${clampedPage + 1} of ${totalPages}`,
        }),
    ],
    ephemeral: true,
  });
}

async function handlePlay(
  interaction: ChatInputCommandInteraction,
  client: BeatboxClient,
  userId: string
) {
  const member = interaction.guild?.members.cache.get(interaction.user.id);
  const voiceChannel = member?.voice.channel;

  if (!voiceChannel) {
    await interaction.reply({
      embeds: [
        errorEmbed("You need to be in a voice channel to play your favorites."),
      ],
      ephemeral: true,
    });
    return;
  }

  const playlist = await prisma.playlist.findFirst({
    where: {
      userId,
      name: { equals: "Favorites", mode: "insensitive" },
    },
    include: { tracks: { orderBy: { position: "asc" } } },
  });

  if (!playlist || playlist.tracks.length === 0) {
    await interaction.reply({
      embeds: [errorEmbed("You don't have any favorite tracks yet.")],
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply();

  // Cancel any pending disconnect timer
  const disconnectTimer = client.disconnectTimers.get(interaction.guildId!);
  if (disconnectTimer) {
    clearTimeout(disconnectTimer);
    client.disconnectTimers.delete(interaction.guildId!);
  }

  let player = client.kazagumo.players.get(interaction.guildId!);
  if (!player) {
    player = await client.kazagumo.createPlayer({
      guildId: interaction.guildId!,
      textId: interaction.channelId,
      voiceId: voiceChannel.id,
      volume: 80,
    });
    await applyGuildSettings(player, interaction.guildId!);
  }

  const totalDuration = playlist.tracks.reduce((s, t) => s + t.duration, 0);

  // Reply early
  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(EMBED_COLORS.SUCCESS)
        .setAuthor({ name: "Loading Favorites ❤️" })
        .setDescription(
          `Loading **${playlist.tracks.length}** favorite tracks into the queue...`
        )
        .setFooter({
          text: `Total duration: ${formatDuration(totalDuration)}`,
        }),
    ],
  });

  // Search all tracks in parallel
  const requester = {
    id: interaction.user.id,
    username: interaction.user.username,
    avatar: interaction.user.displayAvatarURL(),
  };

  const results = await Promise.all(
    playlist.tracks.map(async (track) => {
      try {
        const result = await client.kazagumo.search(track.uri, { requester });
        if (result.tracks.length > 0) return result.tracks[0];

        // Fallback: search by title + author
        const fallback = await client.kazagumo.search(
          `${track.author} - ${track.title}`,
          { requester }
        );
        if (fallback.tracks.length > 0) return fallback.tracks[0];
      } catch (err) {
        console.warn(
          `[favorites play] Failed to resolve: "${track.title}" — ${err}`
        );
      }
      return null;
    })
  );

  // Add resolved tracks in order and start playback on the first one
  let added = 0;
  for (const resolved of results) {
    if (!resolved) continue;
    player.queue.add(resolved);
    added++;

    // Start playing as soon as the first track is added
    if (!player.playing && !player.paused) {
      player.play();
      broadcastState(client, interaction.guildId!);
    }
  }

  broadcastState(client, interaction.guildId!);

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(EMBED_COLORS.SUCCESS)
        .setAuthor({ name: "Favorites Loaded ❤️" })
        .setDescription(
          `Added **${added}/${playlist.tracks.length}** favorite tracks to the queue.`
        )
        .setFooter({
          text: `Total duration: ${formatDuration(totalDuration)}`,
        }),
    ],
  });
}

async function handleRemove(
  interaction: ChatInputCommandInteraction,
  userId: string
) {
  const position = interaction.options.getInteger("position", true);

  const playlist = await prisma.playlist.findFirst({
    where: {
      userId,
      name: { equals: "Favorites", mode: "insensitive" },
    },
    include: { tracks: { orderBy: { position: "asc" } } },
  });

  if (!playlist || playlist.tracks.length === 0) {
    await interaction.reply({
      embeds: [errorEmbed("You don't have any favorite tracks yet.")],
      ephemeral: true,
    });
    return;
  }

  const track = playlist.tracks[position - 1];
  if (!track) {
    await interaction.reply({
      embeds: [
        errorEmbed(
          `Invalid position. You have ${playlist.tracks.length} favorite tracks.`
        ),
      ],
      ephemeral: true,
    });
    return;
  }

  await prisma.playlistTrack.delete({ where: { id: track.id } });

  // Re-index positions
  const remaining = playlist.tracks.filter((t) => t.id !== track.id);
  if (remaining.length > 0) {
    await prisma.$transaction(
      remaining.map((t, i) =>
        prisma.playlistTrack.update({
          where: { id: t.id },
          data: { position: i },
        })
      )
    );
  }

  await interaction.reply({
    embeds: [
      successEmbed(
        `Removed **${truncate(track.title, 50)}** from your Favorites.`
      ),
    ],
  });
}
