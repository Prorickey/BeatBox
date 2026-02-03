import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { BeatboxClient } from "../../structures/Client";
import { EMBED_COLORS } from "@beatbox/shared";

export const data = new SlashCommandBuilder()
  .setName("help")
  .setDescription("List all available commands");

export async function execute(
  interaction: ChatInputCommandInteraction,
  client: BeatboxClient
) {
  try {
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLORS.PRIMARY)
      .setTitle("Beatbox Commands");

    // Group commands by category
    const categories = new Map<string, string[]>();
    for (const [name, command] of client.commands) {
      const category = command.category ?? "other";
      if (!categories.has(category)) {
        categories.set(category, []);
      }
      const description = command.data.description || "No description";
      categories.get(category)!.push(`\`/${name}\` — ${description}`);
    }

    for (const [category, lines] of [...categories.entries()].sort()) {
      const categoryName =
        category.charAt(0).toUpperCase() + category.slice(1);
      embed.addFields({
        name: categoryName,
        value: lines.sort().join("\n"),
      });
    }

    embed.setFooter({ text: "Visit the dashboard for more info" });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (error) {
    console.error("[help] Error building help embed:", error);
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(EMBED_COLORS.ERROR)
          .setDescription("Failed to load command list."),
      ],
      ephemeral: true,
    });
  }
}
