"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Music, Bot, ExternalLink, Headphones } from "lucide-react";
import { getSocket } from "@/lib/socket";
import { SocketEvents } from "@beatbox/shared";

interface Guild {
  id: string;
  name: string;
  icon: string | null;
  botPresent: boolean;
  canManage: boolean;
}

export function GuildSelector() {
  const { data: session, status } = useSession();
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [loading, setLoading] = useState(true);
  const [voiceGuildId, setVoiceGuildId] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;

    const sortGuilds = (data: Guild[]) => {
      data.sort((a, b) => {
        if (a.botPresent !== b.botPresent) return a.botPresent ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      return data;
    };

    // Phase 1: Serve from DB cache (fast)
    fetch("/api/guilds")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch guilds");
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setGuilds(sortGuilds(data));
          setLoading(false);
        }
        // Phase 2: Refresh from Discord API in background
        return fetch("/api/guilds?refresh=true");
      })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to refresh guilds");
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data)) {
          setGuilds(sortGuilds(data));
        }
      })
      .catch((err) => console.error("Failed to fetch guilds:", err))
      .finally(() => setLoading(false));

    // Check if user is in a voice channel
    const userId = (session?.user as any)?.id;
    if (userId) {
      const socket = getSocket();

      const handleVoiceResult = (result: { guildId: string } | null) => {
        if (result) {
          setVoiceGuildId(result.guildId);
        }
      };

      // Register listener BEFORE emitting to avoid race conditions
      socket.once(SocketEvents.USER_VOICE_STATE_RESULT, handleVoiceResult);

      const requestVoiceState = () => {
        socket.emit(SocketEvents.USER_VOICE_STATE, userId);
      };

      if (socket.connected) {
        requestVoiceState();
      } else {
        socket.once("connect", requestVoiceState);
      }

      // Listen for real-time voice state changes
      const handleVoiceChange = (data: { userId: string; guildId: string; channelId: string | null }) => {
        if (data.userId !== userId) return;
        if (data.channelId) {
          setVoiceGuildId(data.guildId);
        } else {
          setVoiceGuildId((prev) => (prev === data.guildId ? null : prev));
        }
      };
      socket.on(SocketEvents.VOICE_STATE_CHANGED, handleVoiceChange);
      return () => {
        socket.off(SocketEvents.USER_VOICE_STATE_RESULT, handleVoiceResult);
        socket.off("connect", requestVoiceState);
        socket.off(SocketEvents.VOICE_STATE_CHANGED, handleVoiceChange);
      };
    }
  }, [status, session]);

  if (status === "loading" || loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="h-[72px] animate-pulse rounded-xl border bg-card"
          />
        ))}
      </div>
    );
  }

  if (!session) {
    return (
      <div className="text-center text-muted-foreground">
        Sign in to see your servers.
      </div>
    );
  }

  if (guilds.length === 0) {
    return (
      <div className="text-center text-muted-foreground">
        No servers found. Make sure you're in at least one Discord server.
      </div>
    );
  }

  const voiceGuild = voiceGuildId ? guilds.find((g) => g.id === voiceGuildId && g.botPresent) : null;
  const botGuilds = guilds.filter((g) => g.botPresent && g.id !== voiceGuildId);
  const otherGuilds = guilds.filter((g) => !g.botPresent).sort((a, b) => {
    if (a.canManage !== b.canManage) return a.canManage ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="space-y-8">
      {voiceGuild && (
        <div>
          <h2 className="mb-4 flex items-center gap-2 text-sm font-medium text-primary">
            <Headphones className="h-4 w-4" />
            Currently in Voice
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <GuildCard guild={voiceGuild} highlight />
          </div>
        </div>
      )}

      {botGuilds.length > 0 && (
        <div>
          <h2 className="mb-4 flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Bot className="h-4 w-4" />
            Servers with Beatbox
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {botGuilds.map((guild) => (
              <GuildCard key={guild.id} guild={guild} />
            ))}
          </div>
        </div>
      )}

      {otherGuilds.length > 0 && (
        <div>
          <h2 className="mb-4 text-sm font-medium text-muted-foreground">
            Other Servers
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {otherGuilds.map((guild) => (
              <GuildCard key={guild.id} guild={guild} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function GuildCard({ guild, highlight }: { guild: Guild; highlight?: boolean }) {
  const canAdd = !guild.botPresent && guild.canManage;
  const content = (
    <div
      className={`group flex items-center gap-4 rounded-xl border p-4 transition-all ${
        highlight
          ? "border-primary/50 bg-primary/5 hover:border-primary hover:bg-primary/10 cursor-pointer ring-1 ring-primary/20"
          : guild.botPresent
            ? "bg-card hover:border-primary/50 hover:bg-accent/50 cursor-pointer"
            : canAdd
              ? "bg-card hover:border-primary/50 hover:bg-accent/50 cursor-pointer"
              : "bg-card/50 opacity-60"
      }`}
    >
      <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10">
        {guild.icon ? (
          <Image
            src={guild.icon}
            alt={guild.name}
            width={48}
            height={48}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-lg font-semibold text-primary">
            {guild.name.charAt(0).toUpperCase()}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <h3
          className={`truncate font-semibold ${
            guild.botPresent ? "group-hover:text-primary" : ""
          }`}
        >
          {guild.name}
        </h3>
        <p className="text-xs text-muted-foreground">
          {guild.botPresent ? "Click to manage" : canAdd ? "Click to add Beatbox" : "Bot not added"}
        </p>
      </div>
      {!guild.botPresent && (
        <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
      )}
    </div>
  );

  if (guild.botPresent) {
    return <Link href={`/dashboard/${guild.id}`}>{content}</Link>;
  }

  return (
    <a
      href={`https://discord.com/oauth2/authorize?client_id=${process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID}&permissions=3165184&scope=bot+applications.commands&guild_id=${guild.id}`}
      target="_blank"
      rel="noopener noreferrer"
      title="Add Beatbox to this server"
    >
      {content}
    </a>
  );
}
