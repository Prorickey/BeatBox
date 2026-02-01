import {
  Client,
  Collection,
  GatewayIntentBits,
  type ChatInputCommandInteraction,
} from "discord.js";
import { Kazagumo } from "kazagumo";
import { Connectors } from "shoukaku";
import { Server as SocketServer } from "socket.io";
import { createServer } from "http";
import type { Command } from "../types";
import { loadCommands } from "../handlers/commandHandler";
import { loadEvents } from "../handlers/eventHandler";
import { setupSocketServer } from "../handlers/socketHandler";

export class BeatboxClient extends Client {
  public commands: Collection<string, Command> = new Collection();
  public kazagumo: Kazagumo;
  public io: SocketServer;
  public disconnectTimers: Map<string, Timer> = new Map();
  public activeSessions: Map<string, string> = new Map(); // guildId -> session cuid
  public previousTracks: Map<string, any[]> = new Map(); // guildId -> history stack
  public currentTrackRef: Map<string, any> = new Map(); // guildId -> last known track
  public goingPrevious: Set<string> = new Set(); // guilds currently going to previous track
  public voiceJoinTimes: Map<string, number> = new Map(); // userId -> join timestamp (ms)
  public voiceUpdateTimers: Map<string, Timer> = new Map(); // userId -> flush interval
  public skipVotes: Map<string, Set<string>> = new Map(); // guildId -> Set of user IDs who voted to skip

  constructor() {
    super({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
      ],
    });

    this.kazagumo = new Kazagumo(
      {
        defaultSearchEngine: "youtube",
        send: (guildId, payload) => {
          const guild = this.guilds.cache.get(guildId);
          if (guild) guild.shard.send(payload);
        },
      },
      new Connectors.DiscordJS(this),
      [
        {
          name: "main",
          url: `${process.env.LAVALINK_HOST ?? "localhost"}:${process.env.LAVALINK_PORT ?? "2333"}`,
          auth: process.env.LAVALINK_PASSWORD ?? "youshallnotpass",
          secure: false,
        },
      ]
    );

    const httpServer = createServer();
    this.io = new SocketServer(httpServer, {
      cors: {
        origin: process.env.NEXTAUTH_URL ?? "http://localhost:3000",
        methods: ["GET", "POST"],
      },
    });

    const socketPort = parseInt(process.env.SOCKET_PORT ?? "3001");
    httpServer.listen(socketPort, () => {
      console.log(`Socket.io server running on port ${socketPort}`);
    });
  }

  async start() {
    await loadCommands(this);
    await loadEvents(this);
    setupSocketServer(this);
    await this.login(process.env.DISCORD_TOKEN);
    console.log(`Beatbox is online!`);
  }
}
