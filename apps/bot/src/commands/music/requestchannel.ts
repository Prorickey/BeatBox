import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
  ChannelType,
} from "discord.js";
import type { BeatboxClient } from "../../structures/Client";
import { errorEmbed, successEmbed, playerButtons } from "../../utils/embeds";
import { prisma } from "@beatbox/database";
import { EMBED_COLORS } from "@beatbox/shared";

export const data = new SlashCommandBuilder()
  .setName("requestchannel")
  .setDescription("Configure a song request channel")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((subcommand) =>
    subcommand
      .setName("setup")
      .setDescription("Set this channel as the song request channel")
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("disable")
      .setDescription("Disable the song request channel")
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
  client: BeatboxClient
) {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "setup") {
    await handleSetup(interaction, client);
  } else if (subcommand === "disable") {
    await handleDisable(interaction, client);
  }
}

async function handleSetup(
  interaction: ChatInputCommandInteraction,
  client: BeatboxClient
) {
  const channel = interaction.channel;

  // Verify channel type
  if (!channel || channel.type !== ChannelType.GuildText) {
    await interaction.reply({
      embeds: [errorEmbed("This command can only be used in a text channel.")],
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply();

  try {
    // Check if there's already a request channel set up
    const existingSettings = await prisma.guildSettings.findFirst({
      where: { guildId: interaction.guildId! },
    });

    if (existingSettings?.requestChannelId) {
      // Try to delete the old message
      if (existingSettings.requestMessageId) {
        try {
          const oldChannel = await client.channels.fetch(
            existingSettings.requestChannelId
          );
          if (oldChannel?.isTextBased()) {
            const oldMessage = await oldChannel.messages.fetch(
              existingSettings.requestMessageId
            );
            await oldMessage.delete();
          }
        } catch (error) {
          console.warn(
            `[requestchannel] Could not delete old request message: ${error}`
          );
        }
      }
    }

    // Create the persistent embed
    const embed = new EmbedBuilder()
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

    const message = await channel.send({
      embeds: [embed],
      components: [playerButtons(false)],
    });

    // Save to database
    await prisma.guildSettings.upsert({
      where: { guildId: interaction.guildId! },
      create: {
        guildId: interaction.guildId!,
        requestChannelId: channel.id,
        requestMessageId: message.id,
        guild: {
          connectOrCreate: {
            where: { id: interaction.guildId! },
            create: {
              id: interaction.guildId!,
              name: interaction.guild?.name ?? "Unknown",
            },
          },
        },
      },
      update: {
        requestChannelId: channel.id,
        requestMessageId: message.id,
      },
    });

    await interaction.editReply({
      embeds: [
        successEmbed(
          `Song request channel has been set up in ${channel}!\n\nUsers can now type song names or URLs here to add them to the queue.`
        ),
      ],
    });
  } catch (error) {
    console.error("[requestchannel] Setup error:", error);
    await interaction.editReply({
      embeds: [errorEmbed("Failed to set up the song request channel.")],
    });
  }
}

async function handleDisable(
  interaction: ChatInputCommandInteraction,
  client: BeatboxClient
) {
  await interaction.deferReply();

  try {
    const settings = await prisma.guildSettings.findFirst({
      where: { guildId: interaction.guildId! },
    });

    if (!settings?.requestChannelId) {
      await interaction.editReply({
        embeds: [errorEmbed("No song request channel is currently configured.")],
      });
      return;
    }

    // Try to delete the persistent message
    if (settings.requestMessageId) {
      try {
        const channel = await client.channels.fetch(settings.requestChannelId);
        if (channel?.isTextBased()) {
          const message = await channel.messages.fetch(settings.requestMessageId);
          await message.delete();
        }
      } catch (error) {
        console.warn(
          `[requestchannel] Could not delete request message: ${error}`
        );
      }
    }

    // Clear the settings
    await prisma.guildSettings.update({
      where: { guildId: interaction.guildId! },
      data: {
        requestChannelId: null,
        requestMessageId: null,
      },
    });

    await interaction.editReply({
      embeds: [successEmbed("Song request channel has been disabled.")],
    });
  } catch (error) {
    console.error("[requestchannel] Disable error:", error);
    await interaction.editReply({
      embeds: [errorEmbed("Failed to disable the song request channel.")],
    });
  }
}
