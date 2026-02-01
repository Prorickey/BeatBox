"use client";

import { useEffect, useRef, useState } from "react";
import { Settings, Loader2, Save, CheckCircle, Search, ChevronDown } from "lucide-react";

interface Guild {
  id: string;
  name: string;
  icon: string | null;
  botPresent: boolean;
}

interface GuildSettings {
  announceNowPlaying: boolean;
  defaultRepeatMode: string;
  maxQueueSize: number;
  allowDuplicates: boolean;
  autoPlay: boolean;
}

const defaultSettings: GuildSettings = {
  announceNowPlaying: true,
  defaultRepeatMode: "off",
  maxQueueSize: 500,
  allowDuplicates: true,
  autoPlay: false,
};

export default function SettingsPage() {
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [selectedGuild, setSelectedGuild] = useState<string | null>(null);
  const [settings, setSettings] = useState<GuildSettings>(defaultSettings);
  const [loadingGuilds, setLoadingGuilds] = useState(true);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Load guilds with bot
  useEffect(() => {
    fetch("/api/guilds")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          const botGuilds = data.filter((g: Guild) => g.botPresent);
          setGuilds(botGuilds);
          if (botGuilds.length > 0) {
            setSelectedGuild(botGuilds[0].id);
          }
        }
      })
      .catch(console.error)
      .finally(() => setLoadingGuilds(false));
  }, []);

  // Load settings for selected guild
  useEffect(() => {
    if (!selectedGuild) return;
    setLoadingSettings(true);
    setDirty(false);
    setSaved(false);

    fetch(`/api/settings?guildId=${selectedGuild}`)
      .then((res) => res.json())
      .then((data) => {
        if (data && !data.error) {
          setSettings({
            announceNowPlaying: data.announceNowPlaying ?? true,
            defaultRepeatMode: data.defaultRepeatMode ?? "off",
            maxQueueSize: data.maxQueueSize ?? 500,
            allowDuplicates: data.allowDuplicates ?? true,
            autoPlay: data.autoPlay ?? false,
          });
        }
      })
      .catch(console.error)
      .finally(() => setLoadingSettings(false));
  }, [selectedGuild]);

  const updateSetting = <K extends keyof GuildSettings>(
    key: K,
    value: GuildSettings[K]
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
    setSaved(false);
  };

  const saveSettings = async () => {
    if (!selectedGuild) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guildId: selectedGuild, ...settings }),
      });
      if (res.ok) {
        setDirty(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (err) {
      console.error("Failed to save settings:", err);
    } finally {
      setSaving(false);
    }
  };

  if (loadingGuilds) {
    return (
      <div className="container mx-auto px-6 py-8">
        <h1 className="mb-8 text-3xl font-bold">Settings</h1>
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl border bg-card" />
          ))}
        </div>
      </div>
    );
  }

  if (guilds.length === 0) {
    return (
      <div className="container mx-auto px-6 py-8">
        <h1 className="mb-8 text-3xl font-bold">Settings</h1>
        <div className="rounded-xl border bg-card p-12 text-center">
          <Settings className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
          <p className="text-lg font-medium text-muted-foreground">
            No servers with Beatbox
          </p>
          <p className="mt-1 text-sm text-muted-foreground/70">
            Add Beatbox to a server to configure its settings here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-6 py-8">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Settings</h1>
        <button
          onClick={saveSettings}
          disabled={!dirty || saving}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : saved ? (
            <CheckCircle className="h-4 w-4" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {saving ? "Saving..." : saved ? "Saved" : "Save Changes"}
        </button>
      </div>

      {/* Guild selector */}
      <GuildCombobox
        guilds={guilds}
        selectedGuild={selectedGuild}
        onSelect={setSelectedGuild}
      />

      {/* Settings form */}
      {loadingSettings ? (
        <div className="flex items-center gap-2 py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading settings...
        </div>
      ) : (
        <div className="space-y-4">
          <SettingToggle
            label="Announce Now Playing"
            description="Send a message in the text channel when a new track starts playing."
            checked={settings.announceNowPlaying}
            onChange={(v) => updateSetting("announceNowPlaying", v)}
          />
          <SettingToggle
            label="Allow Duplicates"
            description="Allow the same track to be added to the queue multiple times."
            checked={settings.allowDuplicates}
            onChange={(v) => updateSetting("allowDuplicates", v)}
          />
          <SettingToggle
            label="Auto Play"
            description="Automatically play recommended tracks when the queue is empty."
            checked={settings.autoPlay}
            onChange={(v) => updateSetting("autoPlay", v)}
          />

          <div className="rounded-xl border bg-card p-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium">Default Repeat Mode</h3>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  The repeat mode used when the bot first joins a channel.
                </p>
              </div>
              <select
                value={settings.defaultRepeatMode}
                onChange={(e) =>
                  updateSetting("defaultRepeatMode", e.target.value)
                }
                className="rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              >
                <option value="off">Off</option>
                <option value="track">Track</option>
                <option value="queue">Queue</option>
              </select>
            </div>
          </div>

          <div className="rounded-xl border bg-card p-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium">Max Queue Size</h3>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Maximum number of tracks that can be in the queue at once.
                </p>
              </div>
              <input
                type="number"
                min={10}
                max={10000}
                value={settings.maxQueueSize}
                onChange={(e) =>
                  updateSetting("maxQueueSize", Number(e.target.value))
                }
                className="w-24 rounded-lg border bg-background px-3 py-2 text-right text-sm outline-none focus:border-primary"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GuildCombobox({
  guilds,
  selectedGuild,
  onSelect,
}: {
  guilds: Guild[];
  selectedGuild: string | null;
  onSelect: (guildId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = guilds.filter((g) =>
    g.name.toLowerCase().includes(search.toLowerCase())
  );

  const selected = guilds.find((g) => g.id === selectedGuild);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
    if (!open) setSearch("");
  }, [open]);

  return (
    <div className="relative mb-6" ref={containerRef}>
      <label className="mb-2 block text-sm font-medium text-muted-foreground">
        Server
      </label>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full max-w-xs items-center gap-3 rounded-lg border bg-background px-4 py-2.5 text-sm outline-none transition-colors hover:border-primary focus:border-primary"
      >
        {selected ? (
          <>
            <GuildIcon guild={selected} size={20} />
            <span className="flex-1 truncate text-left">{selected.name}</span>
          </>
        ) : (
          <span className="flex-1 text-left text-muted-foreground">Select a server</span>
        )}
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full max-w-xs overflow-hidden rounded-lg border bg-card shadow-lg">
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search servers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
              }}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
            />
          </div>
          <div className="max-h-56 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                No servers found
              </div>
            ) : (
              filtered.map((g) => (
                <button
                  key={g.id}
                  onClick={() => {
                    onSelect(g.id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted/50 ${
                    g.id === selectedGuild ? "bg-primary/10 text-primary" : ""
                  }`}
                >
                  <GuildIcon guild={g} size={24} />
                  <span className="truncate">{g.name}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function GuildIcon({ guild, size }: { guild: Guild; size: number }) {
  if (guild.icon) {
    return (
      <img
        src={`https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.webp?size=32`}
        alt=""
        width={size}
        height={size}
        className="rounded-full"
      />
    );
  }
  return (
    <div
      className="flex items-center justify-center rounded-full bg-muted text-xs font-medium"
      style={{ width: size, height: size }}
    >
      {guild.name.charAt(0).toUpperCase()}
    </div>
  );
}

function SettingToggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border bg-card p-5">
      <div>
        <h3 className="font-medium">{label}</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 rounded-full transition-colors ${
          checked ? "bg-primary" : "bg-muted"
        }`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}
