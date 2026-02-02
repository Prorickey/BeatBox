"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  ListMusic,
  Plus,
  Music,
  Clock,
  ChevronDown,
  ChevronUp,
  Search,
  Loader2,
  X,
  Trash2,
  GripVertical,
} from "lucide-react";
import { formatDuration, SocketEvents } from "@beatbox/shared";
import { getSocket } from "@/lib/socket";
import { useDragReorder } from "@/hooks/useDragReorder";

interface PlaylistTrack {
  id: string;
  title: string;
  author: string;
  duration: number;
  uri: string;
  artworkUrl: string | null;
  sourceName: string;
  position: number;
}

interface Playlist {
  id: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  userId: string;
  _count: { tracks: number };
  tracks: PlaylistTrack[];
  createdAt: string;
}

interface SearchTrack {
  id: string;
  title: string;
  author: string;
  duration: number;
  uri: string;
  artworkUrl: string | null;
  sourceName: string;
}

export default function PlaylistsPage() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingTrackId, setAddingTrackId] = useState<string | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    fetch("/api/playlists")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setPlaylists(data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Socket search listener
  useEffect(() => {
    const socket = getSocket();

    const handleResults = (data: { tracks: SearchTrack[] }) => {
      setSearchResults(data.tracks?.slice(0, 8) ?? []);
      setSearching(false);
    };

    socket.on(SocketEvents.SEARCH_RESULTS, handleResults);
    return () => {
      socket.off(SocketEvents.SEARCH_RESULTS, handleResults);
    };
  }, []);

  const doSearch = useCallback((query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const socket = getSocket();
    socket.emit(SocketEvents.SEARCH, { guildId: "_search", query: query.trim() });
  }, []);

  const handleSearchInput = (value: string) => {
    setSearchQuery(value);
    clearTimeout(searchTimerRef.current);
    if (!value.trim()) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    // Debounce 500ms
    searchTimerRef.current = setTimeout(() => doSearch(value), 500);
  };

  const addTrackToPlaylist = async (playlistId: string, track: SearchTrack) => {
    setAddingTrackId(track.id);
    try {
      const res = await fetch(`/api/playlists/${playlistId}/tracks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: track.title,
          author: track.author,
          duration: track.duration,
          uri: track.uri,
          artworkUrl: track.artworkUrl,
          sourceName: track.sourceName,
        }),
      });
      if (res.ok) {
        const newTrack = await res.json();
        setPlaylists((prev) =>
          prev.map((p) =>
            p.id === playlistId
              ? {
                  ...p,
                  tracks: [...p.tracks, newTrack],
                  _count: { tracks: p._count.tracks + 1 },
                }
              : p
          )
        );
      }
    } catch (err) {
      console.error("Failed to add track:", err);
    } finally {
      setAddingTrackId(null);
    }
  };

  const reorderPlaylistTracks = async (
    playlistId: string,
    from: number,
    to: number
  ) => {
    // Optimistic update
    setPlaylists((prev) =>
      prev.map((p) => {
        if (p.id !== playlistId) return p;
        const newTracks = [...p.tracks];
        const [moved] = newTracks.splice(from, 1);
        newTracks.splice(to, 0, moved);
        return { ...p, tracks: newTracks };
      })
    );

    // Persist to API
    const playlist = playlists.find((p) => p.id === playlistId);
    if (!playlist) return;
    const newTracks = [...playlist.tracks];
    const [moved] = newTracks.splice(from, 1);
    newTracks.splice(to, 0, moved);

    try {
      await fetch(`/api/playlists/${playlistId}/tracks`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: newTracks.map((t) => t.id) }),
      });
    } catch (err) {
      console.error("Failed to reorder tracks:", err);
    }
  };

  const removeTrack = async (playlistId: string, trackId: string) => {
    try {
      const res = await fetch(
        `/api/playlists/${playlistId}/tracks?trackId=${trackId}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        setPlaylists((prev) =>
          prev.map((p) =>
            p.id === playlistId
              ? {
                  ...p,
                  tracks: p.tracks.filter((t) => t.id !== trackId),
                  _count: { tracks: p._count.tracks - 1 },
                }
              : p
          )
        );
      }
    } catch (err) {
      console.error("Failed to remove track:", err);
    }
  };

  const createPlaylist = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/playlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          description: newDesc.trim() || null,
          isPublic: true,
        }),
      });
      if (res.ok) {
        const playlist = await res.json();
        setPlaylists((prev) => [playlist, ...prev]);
        setNewName("");
        setNewDesc("");
        setShowCreate(false);
        setExpandedId(playlist.id);
      }
    } catch (err) {
      console.error("Failed to create playlist:", err);
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-6 py-8">
        <h1 className="mb-8 text-3xl font-bold">Playlists</h1>
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-xl border bg-card"
            />
          ))}
        </div>
      </div>
    );
  }

  const deletePlaylist = async (playlistId: string) => {
    try {
      const res = await fetch(`/api/playlists/${playlistId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setPlaylists((prev) => prev.filter((p) => p.id !== playlistId));
        if (expandedId === playlistId) setExpandedId(null);
      }
    } catch (err) {
      console.error("Failed to delete playlist:", err);
    }
  };

  return (
    <div className="container mx-auto px-6 py-8">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Playlists</h1>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          New Playlist
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="mb-6 rounded-xl border bg-card p-6">
          <h2 className="mb-4 text-lg font-semibold">Create Playlist</h2>
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Playlist name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createPlaylist()}
              className="w-full rounded-lg border bg-background px-4 py-2.5 text-sm outline-none focus:border-primary"
            />
            <input
              type="text"
              placeholder="Description (optional)"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createPlaylist()}
              className="w-full rounded-lg border bg-background px-4 py-2.5 text-sm outline-none focus:border-primary"
            />
            <div className="flex gap-3">
              <button
                onClick={createPlaylist}
                disabled={!newName.trim() || creating}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {creating ? "Creating..." : "Create"}
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Playlist list */}
      {playlists.length === 0 ? (
        <div className="rounded-xl border bg-card p-12 text-center">
          <ListMusic className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
          <p className="text-lg font-medium text-muted-foreground">
            No playlists yet
          </p>
          <p className="mt-1 text-sm text-muted-foreground/70">
            Create a playlist to save your favorite tracks and load them
            anytime.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {playlists.map((playlist) => {
            const isExpanded = expandedId === playlist.id;
            const totalDuration = playlist.tracks.reduce(
              (sum, t) => sum + t.duration,
              0
            );

            return (
              <div
                key={playlist.id}
                className="overflow-hidden rounded-xl border bg-card transition-colors"
              >
                <div
                  role="button"
                  onClick={() => {
                    setExpandedId(isExpanded ? null : playlist.id);
                    if (isExpanded) {
                      setSearchQuery("");
                      setSearchResults([]);
                    }
                  }}
                  className="flex w-full cursor-pointer items-center gap-4 p-5 text-left transition-colors hover:bg-accent/50"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                    <ListMusic className="h-6 w-6 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-semibold">{playlist.name}</h3>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Music className="h-3 w-3" />
                        {playlist._count.tracks} tracks
                      </span>
                      {totalDuration > 0 && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDuration(totalDuration)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isExpanded && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete "${playlist.name}"?`)) {
                            deletePlaylist(playlist.id);
                          }
                        }}
                        className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                    {isExpanded ? (
                      <ChevronUp className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t px-5 pb-5 pt-4">
                    {playlist.description && (
                      <p className="mb-4 text-sm text-muted-foreground">
                        {playlist.description}
                      </p>
                    )}

                    {/* Search / Add tracks */}
                    <div className="mb-4">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <input
                          type="text"
                          placeholder="Search by name or paste a link..."
                          value={searchQuery}
                          onChange={(e) => handleSearchInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              clearTimeout(searchTimerRef.current);
                              doSearch(searchQuery);
                            }
                          }}
                          className="w-full rounded-lg border bg-background py-2.5 pl-10 pr-10 text-sm outline-none focus:border-primary"
                        />
                        {searchQuery && (
                          <button
                            onClick={() => {
                              setSearchQuery("");
                              setSearchResults([]);
                            }}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>

                      {/* Search results */}
                      {(searching || searchResults.length > 0) && (
                        <div className="mt-2 rounded-lg border bg-background">
                          {searching && searchResults.length === 0 && (
                            <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Searching...
                            </div>
                          )}
                          {searchResults.map((track) => {
                            const alreadyAdded = playlist.tracks.some(
                              (t) => t.uri === track.uri
                            );
                            return (
                              <div
                                key={track.id}
                                className="flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0"
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-medium">
                                    {track.title}
                                  </p>
                                  <p className="truncate text-xs text-muted-foreground">
                                    {track.author} &middot;{" "}
                                    {formatDuration(track.duration)}
                                  </p>
                                </div>
                                <button
                                  onClick={() =>
                                    !alreadyAdded &&
                                    addTrackToPlaylist(playlist.id, track)
                                  }
                                  disabled={
                                    alreadyAdded || addingTrackId === track.id
                                  }
                                  className="flex shrink-0 items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
                                >
                                  {addingTrackId === track.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Plus className="h-3 w-3" />
                                  )}
                                  {alreadyAdded ? "Added" : "Add"}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Track list */}
                    {playlist.tracks.length === 0 && !searchQuery ? (
                      <p className="py-4 text-center text-sm text-muted-foreground">
                        No tracks yet — search above to add some.
                      </p>
                    ) : (
                      playlist.tracks.length > 0 && (
                        <PlaylistTrackList
                          playlistId={playlist.id}
                          tracks={playlist.tracks}
                          onReorder={(from, to) =>
                            reorderPlaylistTracks(playlist.id, from, to)
                          }
                          onRemove={(trackId) =>
                            removeTrack(playlist.id, trackId)
                          }
                        />
                      )
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PlaylistTrackList({
  playlistId,
  tracks,
  onReorder,
  onRemove,
}: {
  playlistId: string;
  tracks: PlaylistTrack[];
  onReorder: (from: number, to: number) => void;
  onRemove: (trackId: string) => void;
}) {
  const { getDragProps, isOver, isDragging } = useDragReorder(onReorder);

  return (
    <div className="rounded-lg border bg-background">
      {tracks.map((track, i) => (
        <div
          key={track.id}
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
            onClick={() => onRemove(track.id)}
            className="flex-shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
