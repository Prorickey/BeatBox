import type { ButtonInteraction } from "discord.js";
import type { BeatboxClient } from "../structures/Client";
import { errorEmbed, successEmbed, queueEmbed, queueButtons } from "../utils/embeds";
import { broadcastState } from "./socketHandler";
import { formatDuration } from "@beatbox/shared";

export async function handleButton(
  interaction: ButtonInteraction,
  client: BeatboxClient
) {
  // Handle queue pagination buttons separately (no voice channel required)
  if (
    interaction.customId.startsWith("queue:prev:") ||
    interaction.customId.startsWith("queue:next:")
  ) {
    await handleQueuePagination(interaction, client);
    return;
  }

  const player = client.kazagumo.players.get(interaction.guildId!);
  if (!player) {
    await interaction.reply({
      embeds: [errorEmbed("No active player in this server.")],
      ephemeral: true,
    });
    return;
  }

  const member = interaction.guild?.members.cache.get(interaction.user.id);
  if (!member?.voice.channel) {
    await interaction.reply({
      embeds: [errorEmbed("You need to be in a voice channel.")],
      ephemeral: true,
    });
    return;
  }

  switch (interaction.customId) {
    case "player:pause":
      player.pause(true);
      await interaction.reply({
        embeds: [successEmbed("⏸️ Paused the player.")],
        ephemeral: true,
      });
      break;
    case "player:resume":
      player.pause(false);
      await interaction.reply({
        embeds: [successEmbed("▶️ Resumed the player.")],
        ephemeral: true,
      });
      break;
    case "player:skip":
      player.skip();
      await interaction.reply({
        embeds: [successEmbed("⏭️ Skipped the current track.")],
        ephemeral: true,
      });
      break;
    case "player:stop":
      player.destroy();
      await interaction.reply({
        embeds: [successEmbed("🛑 Stopped the player and cleared the queue.")],
        ephemeral: true,
      });
      break;
    case "player:previous":
      // Seek to start of current track as "previous"
      player.seek(0);
      await interaction.reply({
        embeds: [successEmbed("⏪ Restarted the current track.")],
        ephemeral: true,
      });
      break;
    case "player:queue":
      await interaction.reply({
        content: `📋 **Queue:** ${player.queue.length} track${player.queue.length === 1 ? "" : "s"}`,
        ephemeral: true,
      });
      break;
  }

  broadcastState(client, interaction.guildId!);
}

async function handleQueuePagination(
  interaction: ButtonInteraction,
  client: BeatboxClient
) {
  const player = client.kazagumo.players.get(interaction.guildId!);
  if (!player?.queue.current) {
    await interaction.update({
      embeds: [errorEmbed("Nothing is playing right now.")],
      components: [],
    });
    return;
  }

  // Extract the target page number from the customId (e.g. "queue:next:2" -> 2)
  const parts = interaction.customId.split(":");
  const targetPage = parseInt(parts[2], 10);

  const tracksPerPage = 10;
  const totalPages = Math.max(1, Math.ceil(player.queue.length / tracksPerPage));
  const clampedPage = Math.max(0, Math.min(targetPage, totalPages - 1));

  const pageTracks = player.queue.slice(
    clampedPage * tracksPerPage,
    (clampedPage + 1) * tracksPerPage
  );

  const current = player.queue.current;
  const currentTrack = {
    id: current.identifier,
    title: current.title,
    author: current.author,
    duration: current.length ?? 0,
    uri: current.uri ?? "",
    artworkUrl: current.thumbnail ?? null,
    sourceName: current.sourceName ?? "unknown",
    requester: current.requester as any,
  };

  const queueTracks = pageTracks.map((t) => ({
    id: t.identifier,
    title: t.title,
    author: t.author,
    duration: t.length ?? 0,
    uri: t.uri ?? "",
    artworkUrl: t.thumbnail ?? null,
    sourceName: t.sourceName ?? "unknown",
    requester: t.requester as any,
  }));

  const embed = queueEmbed(queueTracks, currentTrack, clampedPage, totalPages);

  const totalDuration = player.queue.reduce((a, t) => a + (t.length ?? 0), 0);
  embed.addFields({
    name: "\u200b",
    value: `**${player.queue.length} tracks** — Total: ${formatDuration(totalDuration)}`,
  });

  const components = totalPages > 1 ? [queueButtons(clampedPage, totalPages)] : [];
  await interaction.update({ embeds: [embed], components });
}
