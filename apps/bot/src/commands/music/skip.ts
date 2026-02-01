import { SlashCommandBuilder, type ChatInputCommandInteraction, PermissionFlagsBits } from "discord.js";
import type { BeatboxClient } from "../../structures/Client";
import { errorEmbed, successEmbed } from "../../utils/embeds";
import { broadcastState } from "../../handlers/socketHandler";

export const data = new SlashCommandBuilder()
  .setName("skip")
  .setDescription("Skip the current track");

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

  const currentTrack = player.queue.current;
  const title = currentTrack.title;
  const guildId = interaction.guildId!;
  const userId = interaction.user.id;

  // Check if user is the requester of the current track
  const requester = currentTrack.requester as { id: string; username: string } | undefined;
  if (requester && requester.id === userId) {
    player.skip();
    await interaction.reply({
      embeds: [successEmbed(`Skipped **${title}** (you requested this track)`)],
    });
    broadcastState(client, guildId);
    // Clear votes after skip
    client.skipVotes.delete(guildId);
    return;
  }

  // Check if user has ManageGuild permission
  if (interaction.member && typeof interaction.member.permissions !== 'string' && interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
    player.skip();
    await interaction.reply({
      embeds: [successEmbed(`Skipped **${title}**`)],
    });
    broadcastState(client, guildId);
    // Clear votes after skip
    client.skipVotes.delete(guildId);
    return;
  }

  // Vote skip logic
  const voiceChannel = interaction.guild?.channels.cache.get(player.voiceId!);
  if (!voiceChannel || !voiceChannel.isVoiceBased()) {
    await interaction.reply({
      embeds: [errorEmbed("Could not find the voice channel.")],
      ephemeral: true,
    });
    return;
  }

  // Count non-bot members in the voice channel
  const members = voiceChannel.members.filter(m => !m.user.bot);
  const memberCount = members.size;

  // Initialize vote set if it doesn't exist
  if (!client.skipVotes.has(guildId)) {
    client.skipVotes.set(guildId, new Set());
  }

  const votes = client.skipVotes.get(guildId)!;
  votes.add(userId);

  const requiredVotes = Math.ceil(memberCount / 2);
  const currentVotes = votes.size;

  if (currentVotes >= requiredVotes) {
    // Skip the track and clear votes
    player.skip();
    await interaction.reply({
      embeds: [successEmbed(`Vote skip passed! Skipped **${title}** (${currentVotes}/${requiredVotes} votes)`)],
    });
    broadcastState(client, guildId);
    client.skipVotes.delete(guildId);
  } else {
    // Not enough votes yet
    await interaction.reply({
      embeds: [successEmbed(`Vote skip: **${currentVotes}/${requiredVotes}** votes needed to skip`)],
    });
  }
}
