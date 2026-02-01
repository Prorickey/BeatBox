import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { BeatboxClient } from "../../structures/Client";
import { errorEmbed, queueEmbed, queueButtons } from "../../utils/embeds";
import { formatDuration } from "@beatbox/shared";

export const data = new SlashCommandBuilder()
  .setName("queue")
  .setDescription("View the current queue")
  .addIntegerOption((option) =>
    option
      .setName("page")
      .setDescription("Page number")
      .setMinValue(1)
      .setRequired(false)
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
  client: BeatboxClient
) {
  const player = client.kazagumo.players.get(interaction.guildId!);
  if (!player?.queue.current) {
    await interaction.reply({
      embeds: [errorEmbed("Nothing is playing right now.")],
      ephemeral: true,
    });
    return;
  }

  const page = (interaction.options.getInteger("page") ?? 1) - 1;
  const tracksPerPage = 10;
  const totalPages = Math.max(1, Math.ceil(player.queue.length / tracksPerPage));
  const clampedPage = Math.min(page, totalPages - 1);

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
  await interaction.reply({ embeds: [embed], components });
}
