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
import { errorEmbed, successEmbed, trackAddedEmbed } from "../../utils/embeds";
import { broadcastState } from "../../handlers/socketHandler";
import { applyGuildSettings } from "../../utils/guildSettings";

export const data = new SlashCommandBuilder()
  .setName("playlist")
  .setDescription("Manage your playlists")
  .addSubcommand((sub) =>
    sub
      .setName("create")
      .setDescription("Create a new playlist")
      .addStringOption((opt) =>
        opt.setName("name").setDescription("Playlist name").setRequired(true)
      )
      .addStringOption((opt) =>
        opt
          .setName("description")
          .setDescription("Playlist description")
          .setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("delete")
      .setDescription("Delete a playlist")
      .addStringOption((opt) =>
        opt
          .setName("name")
          .setDescription("Playlist name")
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub.setName("list").setDescription("List your playlists")
  )
  .addSubcommand((sub) =>
    sub
      .setName("view")
      .setDescription("View tracks in a playlist")
      .addStringOption((opt) =>
        opt
          .setName("name")
          .setDescription("Playlist name")
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("add")
      .setDescription("Add a track to a playlist")
      .addStringOption((opt) =>
        opt
          .setName("playlist")
          .setDescription("Playlist name")
          .setRequired(true)
      )
      .addStringOption((opt) =>
        opt
          .setName("query")
          .setDescription("Song name or URL to add")
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("remove")
      .setDescription("Remove a track from a playlist")
      .addStringOption((opt) =>
        opt
          .setName("playlist")
          .setDescription("Playlist name")
          .setRequired(true)
      )
      .addIntegerOption((opt) =>
        opt
          .setName("position")
          .setDescription("Track number to remove")
          .setRequired(true)
          .setMinValue(1)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("play")
      .setDescription("Load a playlist into the queue and play it")
      .addStringOption((opt) =>
        opt
          .setName("name")
          .setDescription("Playlist name")
          .setRequired(true)
      )
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
  client: BeatboxClient
) {
  const sub = interaction.options.getSubcommand();
  const userId = interaction.user.id;

  switch (sub) {
    case "create":
      return handleCreate(interaction, userId);
    case "delete":
      return handleDelete(interaction, userId);
    case "list":
      return handleList(interaction, userId);
    case "view":
      return handleView(interaction, userId);
    case "add":
      return handleAdd(interaction, client, userId);
    case "remove":
      return handleRemove(interaction, userId);
    case "play":
      return handlePlay(interaction, client, userId);
  }
}

async function handleCreate(
  interaction: ChatInputCommandInteraction,
  userId: string
) {
  const name = interaction.options.getString("name", true);
  const description = interaction.options.getString("description");

  const existing = await prisma.playlist.findFirst({
    where: { userId, name: { equals: name, mode: "insensitive" } },
  });

  if (existing) {
    await interaction.reply({
      embeds: [errorEmbed(`You already have a playlist named **${name}**.`)],
      ephemeral: true,
    });
    return;
  }

  const playlist = await prisma.playlist.create({
    data: {
      name,
      description,
      isPublic: true,
      userId,
    },
  });

  await interaction.reply({
    embeds: [
      successEmbed(
        `Created playlist **${playlist.name}**${description ? ` — ${description}` : ""}`
      ),
    ],
  });
}

async function handleDelete(
  interaction: ChatInputCommandInteraction,
  userId: string
) {
  const name = interaction.options.getString("name", true);

  const playlist = await prisma.playlist.findFirst({
    where: { userId, name: { equals: name, mode: "insensitive" } },
  });

  if (!playlist) {
    await interaction.reply({
      embeds: [errorEmbed(`No playlist found named **${name}**.`)],
      ephemeral: true,
    });
    return;
  }

  await prisma.playlist.delete({ where: { id: playlist.id } });

  await interaction.reply({
    embeds: [successEmbed(`Deleted playlist **${playlist.name}**.`)],
  });
}

async function handleList(
  interaction: ChatInputCommandInteraction,
  userId: string
) {
  const playlists = await prisma.playlist.findMany({
    where: { userId },
    include: { _count: { select: { tracks: true } } },
    orderBy: { updatedAt: "desc" },
  });

  if (playlists.length === 0) {
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(EMBED_COLORS.PRIMARY)
          .setAuthor({ name: "Your Playlists 🎵" })
          .setDescription(
            "You don't have any playlists yet.\nUse `/playlist create` to make one!"
          ),
      ],
      ephemeral: true,
    });
    return;
  }

  const list = playlists
    .map(
      (p, i) =>
        `\`${(i + 1).toString().padStart(2, " ")}.\` **${p.name}** — ${p._count.tracks} tracks${p.description ? ` *${truncate(p.description, 40)}*` : ""}`
    )
    .join("\n");

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(EMBED_COLORS.PRIMARY)
        .setAuthor({ name: "Your Playlists 🎵" })
        .setDescription(list)
        .setFooter({ text: `${playlists.length} playlists` }),
    ],
    ephemeral: true,
  });
}

async function handleView(
  interaction: ChatInputCommandInteraction,
  userId: string
) {
  const name = interaction.options.getString("name", true);

  const playlist = await prisma.playlist.findFirst({
    where: {
      OR: [
        { userId, name: { equals: name, mode: "insensitive" } },
        { isPublic: true, name: { equals: name, mode: "insensitive" } },
      ],
    },
    include: { tracks: { orderBy: { position: "asc" } } },
  });

  if (!playlist) {
    await interaction.reply({
      embeds: [errorEmbed(`No playlist found named **${name}**.`)],
      ephemeral: true,
    });
    return;
  }

  if (playlist.tracks.length === 0) {
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(EMBED_COLORS.PRIMARY)
          .setTitle(playlist.name)
          .setDescription(
            playlist.description
              ? `*${playlist.description}*\n\nNo tracks yet.`
              : "No tracks yet."
          )
          .setFooter({ text: "Use /playlist add to add tracks" }),
      ],
      ephemeral: true,
    });
    return;
  }

  const totalDuration = playlist.tracks.reduce((s, t) => s + t.duration, 0);
  const trackList = playlist.tracks
    .slice(0, 20)
    .map(
      (t, i) =>
        `\`${(i + 1).toString().padStart(2, " ")}.\` [${truncate(t.title, 40)}](${t.uri}) — ${formatDuration(t.duration)}`
    )
    .join("\n");

  const more =
    playlist.tracks.length > 20
      ? `\n... and ${playlist.tracks.length - 20} more`
      : "";

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(EMBED_COLORS.PRIMARY)
        .setTitle(playlist.name)
        .setDescription(
          (playlist.description ? `*${playlist.description}*\n\n` : "") +
            trackList +
            more
        )
        .setFooter({
          text: `${playlist.tracks.length} tracks · ${formatDuration(totalDuration)}`,
        }),
    ],
    ephemeral: true,
  });
}

async function handleAdd(
  interaction: ChatInputCommandInteraction,
  client: BeatboxClient,
  userId: string
) {
  const playlistName = interaction.options.getString("playlist", true);
  const query = interaction.options.getString("query", true);

  const playlist = await prisma.playlist.findFirst({
    where: { userId, name: { equals: playlistName, mode: "insensitive" } },
    include: { _count: { select: { tracks: true } } },
  });

  if (!playlist) {
    await interaction.reply({
      embeds: [errorEmbed(`No playlist found named **${playlistName}**.`)],
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply();

  try {
    const result = await client.kazagumo.search(query, {
      requester: {
        id: interaction.user.id,
        username: interaction.user.username,
        avatar: interaction.user.displayAvatarURL(),
      },
    });

    if (!result.tracks.length) {
      await interaction.editReply({
        embeds: [errorEmbed("No results found for your search.")],
      });
      return;
    }

    const track = result.tracks[0];

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
        new EmbedBuilder()
          .setColor(EMBED_COLORS.SUCCESS)
          .setDescription(
            `Added **${truncate(track.title, 50)}** to playlist **${playlist.name}**`
          )
          .setFooter({
            text: `Track #${playlist._count.tracks + 1} in ${playlist.name}`,
          }),
      ],
    });
  } catch (error) {
    console.error("Playlist add error:", error);
    await interaction.editReply({
      embeds: [errorEmbed("Failed to search for the track.")],
    });
  }
}

async function handleRemove(
  interaction: ChatInputCommandInteraction,
  userId: string
) {
  const playlistName = interaction.options.getString("playlist", true);
  const position = interaction.options.getInteger("position", true);

  const playlist = await prisma.playlist.findFirst({
    where: { userId, name: { equals: playlistName, mode: "insensitive" } },
    include: { tracks: { orderBy: { position: "asc" } } },
  });

  if (!playlist) {
    await interaction.reply({
      embeds: [errorEmbed(`No playlist found named **${playlistName}**.`)],
      ephemeral: true,
    });
    return;
  }

  const track = playlist.tracks[position - 1];
  if (!track) {
    await interaction.reply({
      embeds: [
        errorEmbed(
          `Invalid position. Playlist has ${playlist.tracks.length} tracks.`
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
        `Removed **${truncate(track.title, 50)}** from **${playlist.name}**.`
      ),
    ],
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
        errorEmbed("You need to be in a voice channel to play a playlist."),
      ],
      ephemeral: true,
    });
    return;
  }

  const name = interaction.options.getString("name", true);

  const playlist = await prisma.playlist.findFirst({
    where: {
      OR: [
        { userId, name: { equals: name, mode: "insensitive" } },
        { isPublic: true, name: { equals: name, mode: "insensitive" } },
      ],
    },
    include: { tracks: { orderBy: { position: "asc" } } },
  });

  if (!playlist) {
    await interaction.reply({
      embeds: [errorEmbed(`No playlist found named **${name}**.`)],
      ephemeral: true,
    });
    return;
  }

  if (playlist.tracks.length === 0) {
    await interaction.reply({
      embeds: [errorEmbed(`Playlist **${name}** is empty.`)],
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
        .setAuthor({ name: "Loading Playlist 📋" })
        .setTitle(playlist.name)
        .setDescription(
          `Loading **${playlist.tracks.length}** tracks into the queue...`
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
          `[playlist play] Failed to resolve: "${track.title}" — ${err}`
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
        .setAuthor({ name: "Playlist Loaded ✅" })
        .setTitle(playlist.name)
        .setDescription(
          `Added **${added}/${playlist.tracks.length}** tracks to the queue.`
        )
        .setFooter({
          text: `Total duration: ${formatDuration(totalDuration)}`,
        }),
    ],
  });
}
