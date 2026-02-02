"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { usePlayer } from "@/hooks/usePlayer";
import { useDragReorder } from "@/hooks/useDragReorder";
import { formatDuration, SocketEvents } from "@beatbox/shared";
import { getSocket } from "@/lib/socket";
import {
  Trash2,
  GripVertical,
  ListX,
  ListMusic,
  Music,
  Search,
  Shuffle,
  X,
  Loader2,
  Plus,
} from "lucide-react";

interface SearchTrack {
  id: string;
  title: string;
  author: string;
  duration: number;
  uri: string;
  artworkUrl: string | null;
  sourceName: string;
}

interface PlaylistMatch {
  id: string;
  name: string;
  trackCount: number;
  tracks: { uri: string }[];
}

export function QueueView({ guildId }: { guildId: string }) {
  const { state, removeTrack, clearQueue, moveTrack, shuffle } = usePlayer(guildId);
  const { queue } = state;
  const { getDragProps, isOver, isDragging } = useDragReorder(moveTrack);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Playlists for search
  const [playlists, setPlaylists] = useState<PlaylistMatch[]>([]);
  const [loadingPlaylistId, setLoadingPlaylistId] = useState<string | null>(
    null
  );

  useEffect(() => {
    fetch("/api/playlists")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setPlaylists(
            data.map((p: any) => ({
              id: p.id,
              name: p.name,
              trackCount: p._count?.tracks ?? p.tracks?.length ?? 0,
              tracks: (p.tracks ?? []).map((t: any) => ({ uri: t.uri })),
            }))
          );
        }
      })
      .catch(console.error);
  }, []);

  // Listen for search results
  useEffect(() => {
    const socket = getSocket();

    const handleResults = (data: { tracks: SearchTrack[] }) => {
      setSearchResults(data.tracks?.slice(0, 6) ?? []);
      setSearching(false);
    };

    socket.on(SocketEvents.SEARCH_RESULTS, handleResults);
    return () => {
      socket.off(SocketEvents.SEARCH_RESULTS, handleResults);
    };
  }, []);

  const doSearch = useCallback(
    (query: string) => {
      if (!query.trim()) {
        setSearchResults([]);
        setSearching(false);
        return;
      }
      setSearching(true);
      const socket = getSocket();
      socket.emit(SocketEvents.SEARCH, { guildId, query: query.trim() });
    },
    [guildId]
  );

  const handleSearchInput = (value: string) => {
    setSearchQuery(value);
    clearTimeout(searchTimerRef.current);
    if (!value.trim()) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    searchTimerRef.current = setTimeout(() => doSearch(value), 500);
  };

  const addToQueue = (track: SearchTrack) => {
    setAddingId(track.id);
    const socket = getSocket();
    socket.emit(SocketEvents.QUEUE_ADD, { guildId, query: track.uri });
    setTimeout(() => setAddingId(null), 1000);
  };

  const addPlaylistToQueue = (playlist: PlaylistMatch) => {
    setLoadingPlaylistId(playlist.id);
    const socket = getSocket();
    for (const track of playlist.tracks) {
      socket.emit(SocketEvents.QUEUE_ADD, { guildId, query: track.uri });
    }
    setTimeout(() => setLoadingPlaylistId(null), 2000);
  };

  const matchingPlaylists = searchQuery.trim()
    ? playlists.filter((p) =>
        p.name.toLowerCase().includes(searchQuery.trim().toLowerCase())
      )
    : [];

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="font-semibold">
          Queue{" "}
          <span className="text-sm font-normal text-muted-foreground">
            ({queue.length} tracks)
          </span>
        </h3>
        {queue.length > 0 && (
          <div className="flex items-center gap-1">
            <button
              onClick={shuffle}
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Shuffle className="h-3.5 w-3.5" />
              Shuffle
            </button>
            <button
              onClick={clearQueue}
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <ListX className="h-3.5 w-3.5" />
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Search / Add to queue */}
      <div className="border-b px-4 py-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search or paste a link to add..."
            value={searchQuery}
            onChange={(e) => handleSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                clearTimeout(searchTimerRef.current);
                doSearch(searchQuery);
              }
            }}
            className="w-full rounded-lg border bg-background py-2 pl-9 pr-9 text-sm outline-none focus:border-primary"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery("");
                setSearchResults([]);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Search results dropdown */}
        {(searching ||
          searchResults.length > 0 ||
          matchingPlaylists.length > 0) && (
          <div className="mt-2 rounded-lg border bg-background">
            {/* Matching playlists */}
            {matchingPlaylists.map((pl) => (
              <div
                key={`pl-${pl.id}`}
                className="flex items-center gap-2 border-b px-3 py-2 last:border-b-0"
              >
                <ListMusic className="h-4 w-4 flex-shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{pl.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    Playlist &middot; {pl.trackCount} tracks
                  </p>
                </div>
                <button
                  onClick={() => addPlaylistToQueue(pl)}
                  disabled={
                    loadingPlaylistId === pl.id || pl.trackCount === 0
                  }
                  className="flex shrink-0 items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
                >
                  {loadingPlaylistId === pl.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Plus className="h-3 w-3" />
                  )}
                  Add All
                </button>
              </div>
            ))}
            {/* Divider if both playlists and tracks */}
            {matchingPlaylists.length > 0 && searchResults.length > 0 && (
              <div className="border-b" />
            )}
            {searching && searchResults.length === 0 && (
              <div className="flex items-center gap-2 px-3 py-2.5 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Searching...
              </div>
            )}
            {searchResults.map((track) => {
              const alreadyQueued = queue.some(
                (t) => t.uri === track.uri
              );
              return (
                <div
                  key={track.id}
                  className="flex items-center gap-2 border-b px-3 py-2 last:border-b-0"
                >
                  <Music className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">
                      {track.title}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {track.author} &middot; {formatDuration(track.duration)}
                    </p>
                  </div>
                  <button
                    onClick={() => !alreadyQueued && addToQueue(track)}
                    disabled={alreadyQueued || addingId === track.id}
                    className="flex shrink-0 items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
                  >
                    {addingId === track.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Plus className="h-3 w-3" />
                    )}
                    {alreadyQueued ? "Queued" : "Add"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Queue list */}
      {queue.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">
          Queue is empty — search above to add tracks
        </div>
      ) : (
        <div className="max-h-[500px] overflow-y-auto">
          {queue.map((track, i) => (
            <div
              key={`${track.id}-${i}`}
              {...getDragProps(i)}
              className={`group flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0 transition-colors ${
                isDragging(i)
                  ? "opacity-40"
                  : isOver(i)
                    ? "border-t-2 border-t-primary bg-primary/5"
                    : "hover:bg-accent/50"
              }`}
            >
              <GripVertical className="h-4 w-4 flex-shrink-0 cursor-grab text-muted-foreground/50 active:cursor-grabbing" />
              <span className="w-6 text-right text-xs text-muted-foreground">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{track.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {track.author}
                </p>
              </div>
              <span className="flex-shrink-0 text-xs text-muted-foreground">
                {formatDuration(track.duration)}
              </span>
              <button
                onClick={() => removeTrack(i)}
                className="flex-shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
