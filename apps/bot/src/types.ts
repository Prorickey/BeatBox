import type {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from "discord.js";
import type { BeatboxClient } from "./structures/Client";

export interface Command {
  category?: string;
  data:
    | SlashCommandBuilder
    | SlashCommandSubcommandsOnlyBuilder
    | Omit<SlashCommandBuilder, "addSubcommand" | "addSubcommandGroup">;
  execute: (
    interaction: ChatInputCommandInteraction,
    client: BeatboxClient
  ) => Promise<void>;
}
