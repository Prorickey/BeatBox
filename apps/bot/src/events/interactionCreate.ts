import {
  Events,
  type Interaction,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { BeatboxClient } from "../structures/Client";
import { errorEmbed } from "../utils/embeds";
import { handleButton } from "../handlers/buttonHandler";
import { trackInteraction } from "../utils/engagement";

export const name = Events.InteractionCreate;
export const once = false;

export async function execute(interaction: Interaction, client: BeatboxClient) {
  // Fire-and-forget engagement tracking
  trackInteraction(interaction.user.id, client);

  if (interaction.isChatInputCommand()) {
    await handleCommand(interaction, client);
  } else if (interaction.isButton()) {
    await handleButton(interaction, client);
  }
}

async function handleCommand(
  interaction: ChatInputCommandInteraction,
  client: BeatboxClient
) {
  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  const start = performance.now();
  try {
    await command.execute(interaction, client);
  } catch (error) {
    console.error(`Error executing ${interaction.commandName}:`, error);
    const reply = {
      embeds: [errorEmbed("Something went wrong executing that command.")],
      ephemeral: true,
    };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply);
    } else {
      await interaction.reply(reply);
    }
  } finally {
    const ms = (performance.now() - start).toFixed(0);
    const sub = interaction.options.getSubcommand(false);
    const label = sub ? `${interaction.commandName} ${sub}` : interaction.commandName;
    console.log(`[cmd] /${label} — ${ms}ms`);
  }
}
