import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import {
  EMBED_COLORS,
  formatDuration,
  createProgressBar,
  truncate,
  type Track,
} from "@beatbox/shared";

export function nowPlayingEmbed(
  track: Track,
  position: number,
  volume: number,
  repeatMode: string
) {
  const progress = createProgressBar(position, track.duration);
  const elapsed = formatDuration(position);
  const total = formatDuration(track.duration);

  const repeatIcon =
    repeatMode === "track" ? "🔂" : repeatMode === "queue" ? "🔁" : "";
  const volumeIcon = volume === 0 ? "🔇" : volume < 50 ? "🔉" : "🔊";

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS.PRIMARY)
    .setAuthor({ name: "Now Playing 🎵" })
    .setTitle(truncate(track.title, 60))
    .setURL(track.uri)
    .setDescription(
      [
        `by **${track.author}**`,
        "",
        `${elapsed} ${progress} ${total}`,
        "",
        `${volumeIcon} ${volume}% ${repeatIcon}`,
      ].join("\n")
    )
    .setFooter({
      text: `Requested by ${track.requester.username}`,
      iconURL: track.requester.avatar ?? undefined,
    });

  if (track.artworkUrl) {
    embed.setThumbnail(track.artworkUrl);
  }

  return embed;
}

export function queueEmbed(
  tracks: Track[],
  currentTrack: Track | null,
  page: number,
  totalPages: number
) {
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS.PRIMARY)
    .setAuthor({ name: "Queue 📋" });

  if (currentTrack) {
    embed.setDescription(
      `**Now Playing:**\n[${truncate(currentTrack.title, 50).replace(/[\[\]]/g, "")}](${currentTrack.uri}) — ${formatDuration(currentTrack.duration)}`
    );
  }

  if (tracks.length === 0) {
    embed.addFields({
      name: "Up Next",
      value: "The queue is empty. Use `/play` to add tracks!",
    });
  } else {
    const trackList = tracks
      .map(
        (t, i) =>
          `\`${(page * 10 + i + 1).toString().padStart(2, " ")}.\` [${truncate(t.title, 40).replace(/[\[\]]/g, "")}](${t.uri}) — ${formatDuration(t.duration)}`
      )
      .join("\n");

    embed.addFields({ name: "Up Next", value: trackList });
  }

  embed.setFooter({ text: `Page ${page + 1} of ${totalPages}` });

  return embed;
}

export function trackAddedEmbed(track: Track, position: number) {
  return new EmbedBuilder()
    .setColor(EMBED_COLORS.SUCCESS)
    .setAuthor({ name: "Added to Queue ✅" })
    .setTitle(truncate(track.title, 60))
    .setURL(track.uri)
    .setDescription(
      `by **${track.author}** — ${formatDuration(track.duration)}`
    )
    .setThumbnail(track.artworkUrl)
    .setFooter({ text: `Position #${position} in queue` });
}

export function errorEmbed(message: string) {
  return new EmbedBuilder()
    .setColor(EMBED_COLORS.ERROR)
    .setDescription(`❌ ${message}`);
}

export function successEmbed(message: string) {
  return new EmbedBuilder()
    .setColor(EMBED_COLORS.SUCCESS)
    .setDescription(`✅ ${message}`);
}

export function queueButtons(currentPage: number, totalPages: number) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`queue:prev:${currentPage - 1}`)
      .setEmoji("◀")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage <= 0),
    new ButtonBuilder()
      .setCustomId("queue:page")
      .setLabel(`Page ${currentPage + 1} / ${totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`queue:next:${currentPage + 1}`)
      .setEmoji("▶")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage >= totalPages - 1)
  );
}

export function playerButtons(paused: boolean) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("player:previous")
      .setEmoji("⏮")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(paused ? "player:resume" : "player:pause")
      .setEmoji(paused ? "▶️" : "⏸")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("player:skip")
      .setEmoji("⏭")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("player:stop")
      .setEmoji("⏹")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("player:favorite")
      .setEmoji("❤️")
      .setStyle(ButtonStyle.Secondary)
  );
}
