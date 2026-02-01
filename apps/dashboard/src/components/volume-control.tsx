"use client";

import { useState, useRef, useEffect } from "react";
import { usePlayer } from "@/hooks/usePlayer";
import { Volume, Volume1, Volume2, VolumeX } from "lucide-react";

export function VolumeControl({ guildId }: { guildId: string }) {
  const { state, setVolume } = usePlayer(guildId);

  const [isDragging, setIsDragging] = useState(false);
  const [localVolume, setLocalVolume] = useState(state.volume);
  const localVolumeRef = useRef(state.volume);

  // Sync local volume from server when not dragging
  useEffect(() => {
    if (!isDragging) {
      setLocalVolume(state.volume);
      localVolumeRef.current = state.volume;
    }
  }, [state.volume, isDragging]);

  const displayVolume = isDragging ? localVolume : state.volume;

  const VolumeIcon =
    displayVolume === 0
      ? VolumeX
      : displayVolume < 30
        ? Volume
        : displayVolume < 70
          ? Volume1
          : Volume2;

  const handleChange = (value: number) => {
    setLocalVolume(value);
    localVolumeRef.current = value;
  };

  const handlePointerDown = () => {
    setIsDragging(true);
  };

  // Listen for pointer up on the window so we catch it even if the
  // cursor moves off the slider during the drag.
  useEffect(() => {
    if (!isDragging) return;

    const handlePointerUp = () => {
      // Send the final definitive value only on commit
      setVolume(localVolumeRef.current);
      setIsDragging(false);
    };

    window.addEventListener("pointerup", handlePointerUp);
    return () => window.removeEventListener("pointerup", handlePointerUp);
  }, [isDragging, setVolume]);

  return (
    <div className="flex items-center gap-4 rounded-xl border bg-card px-6 py-4">
      <VolumeIcon className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
      <div className="flex-1">
        <input
          type="range"
          min={0}
          max={100}
          value={displayVolume}
          onChange={(e) => handleChange(Number(e.target.value))}
          onPointerDown={handlePointerDown}
          className="w-full accent-primary"
        />
      </div>
      <span className="w-10 text-right text-sm font-medium">
        {displayVolume}%
      </span>
    </div>
  );
}
