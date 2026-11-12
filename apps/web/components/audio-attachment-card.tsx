"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Music, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";

type AudioAttachmentCardProps = {
  src: string;
  filename?: string;
  className?: string;
};

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Modern 2026 UI/UX Audio & Music player card for chat attachments.
 * Features:
 * - HTML5 audio playback with play/pause and progress scrubber
 * - Track duration formatting and live time counter
 * - Interactive waveform visualization bars that animate while playing
 * - Volume mute/unmute and direct download action
 * - High-polish tactile interactions with active scale and accessible hit targets
 */
export function AudioAttachmentCard({
  src,
  filename = "audio-track.mp3",
  className,
}: AudioAttachmentCardProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);

  const extension = filename.split(".").pop()?.toUpperCase() ?? "AUDIO";

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      void audio.play().catch((err) => {
        console.error("Audio playback error:", err);
      });
    }
  }, [isPlaying]);

  const toggleMute = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !audio.muted;
    setIsMuted(audio.muted);
  }, []);

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const nextTime = Number.parseFloat(e.target.value);
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => setDuration(audio.duration);

    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);

    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
    };
  }, []);

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className={cn(
        "group/audio flex flex-col gap-2 rounded-2xl border border-border/80 bg-card p-3 shadow-sm transition-all sm:min-w-[280px] max-w-sm",
        className,
      )}
    >
      {/* Hidden audio element */}
      <audio ref={audioRef} src={src} preload="metadata">
        <track kind="captions" />
      </audio>

      {/* Header: icon, filename, format badge, download */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Music className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="truncate text-xs font-medium text-foreground"
              title={filename}
            >
              {filename}
            </p>
            <span className="inline-block rounded bg-secondary px-1.5 py-0.2 text-[10px] font-mono text-muted-foreground uppercase">
              {extension}
            </span>
          </div>
        </div>

        <a
          href={src}
          download={filename}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-95"
          title={`Download ${filename}`}
          aria-label={`Download ${filename}`}
        >
          <Download className="h-3.5 w-3.5" />
        </a>
      </div>

      {/* Controls row: Play button, waveform/progress scrubber, time */}
      <div className="flex items-center gap-2.5 pt-1">
        <button
          type="button"
          onClick={togglePlay}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-transform hover:opacity-90 active:scale-95"
          aria-label={isPlaying ? "Pause audio" : "Play audio"}
        >
          {isPlaying ? (
            <Pause className="h-3.5 w-3.5 fill-current" />
          ) : (
            <Play className="h-3.5 w-3.5 fill-current translate-x-[1px]" />
          )}
        </button>

        {/* Progress bar scrubber */}
        <div className="relative flex-1 flex flex-col justify-center">
          <div className="relative flex h-3 items-center">
            {/* Custom styled track */}
            <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-75"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            {/* Interactive range input overlaid */}
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.1}
              value={currentTime}
              onChange={handleSeek}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              aria-label="Seek audio"
            />
          </div>

          <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground">
            <span>{formatDuration(currentTime)}</span>
            <span>{formatDuration(duration)}</span>
          </div>
        </div>

        {/* Mute button */}
        <button
          type="button"
          onClick={toggleMute}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-95"
          aria-label={isMuted ? "Unmute" : "Mute"}
        >
          {isMuted ? (
            <VolumeX className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <Volume2 className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {/* Waveform indicator bars while playing */}
      {isPlaying && (
        <div
          className="flex items-end justify-center gap-1 h-3 pt-0.5"
          aria-hidden="true"
        >
          {[40, 75, 55, 90, 60, 80, 45, 95, 70, 50, 85, 65].map((height, i) => (
            <span
              // eslint-disable-next-line react/no-array-index-key
              key={i}
              className="w-1 rounded-full bg-primary/70 animate-pulse"
              style={{
                height: `${height}%`,
                animationDelay: `${(i * 70) % 600}ms`,
                animationDuration: "800ms",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
