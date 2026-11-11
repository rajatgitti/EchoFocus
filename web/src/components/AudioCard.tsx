"use client";

import { Pause, Play, X, Download, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import { motion } from "motion/react";

type Variant = "charcoal" | "red" | "green" | "purple" | "brown";

type Props = {
  heading: string;
  source?: Blob | File | null;
  filenameOverride?: string;
  variant?: Variant;
  onClear?: () => void;
  onDownload?: () => void;
  onFile?: (file: File) => void;
  emptyLabel?: string;
  /** What this input is for, shown in the empty state. */
  hint?: string;
  className?: string;
  id?: string;
};

const COLOR: Record<Variant, { wave: string; progress: string; dot: string }> = {
  charcoal: { wave: "rgba(138,144,196,0.45)", progress: "#c9cdf5", dot: "#8a90c4" },
  brown: { wave: "rgba(154,166,255,0.38)", progress: "#c4cbff", dot: "#9aa6ff" },
  red: { wave: "rgba(242,166,216,0.38)", progress: "#f8cdea", dot: "#f2a6d8" },
  green: { wave: "rgba(143,240,207,0.36)", progress: "#c3f8e6", dot: "#8ff0cf" },
  purple: { wave: "rgba(180,140,255,0.38)", progress: "#d6c2ff", dot: "#b48cff" },
};

const ACCEPT = "audio/*,video/*,.mp3,.wav,.m4a,.mp4,.flac,.ogg,.aac";

export function AudioCard({
  heading,
  source,
  filenameOverride,
  variant = "charcoal",
  onClear,
  onDownload,
  onFile,
  emptyLabel,
  hint,
  className = "",
  id,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!containerRef.current || !source) {
      if (wsRef.current) {
        wsRef.current.destroy();
        wsRef.current = null;
      }
      return;
    }
    const colors = COLOR[variant];
    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: colors.wave,
      progressColor: colors.progress,
      cursorColor: "transparent",
      barWidth: 2,
      barGap: 2,
      barRadius: 4,
      height: 40,
      normalize: true,
      interact: true,
    });
    wsRef.current = ws;
    setReady(false);
    setPlaying(false);
    setTime(0);
    ws.loadBlob(source as Blob);
    ws.on("ready", () => {
      setReady(true);
      setDuration(ws.getDuration());
    });
    ws.on("audioprocess", () => setTime(ws.getCurrentTime()));
    ws.on("seeking", () => setTime(ws.getCurrentTime()));
    ws.on("play", () => setPlaying(true));
    ws.on("pause", () => setPlaying(false));
    ws.on("finish", () => setPlaying(false));
    return () => {
      ws.destroy();
      wsRef.current = null;
    };
  }, [source, variant]);

  const filename = filenameOverride ?? (source instanceof File ? source.name : "audio.wav");
  const sizeStr = source ? `${(source.size / (1024 * 1024)).toFixed(1)} MB` : "";
  const colors = COLOR[variant];

  const openPicker = () => inputRef.current?.click();

  return (
    <div id={id} className={`flex flex-col gap-2.5 ${className}`}>
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: colors.dot, boxShadow: `0 0 10px ${colors.dot}` }} />
        <h3 className="label-mono !text-[var(--text-main)]/90">{heading}</h3>
      </div>

      {onFile && (
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = "";
          }}
        />
      )}

      {source ? (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="vanta-card relative overflow-hidden p-4 flex flex-col gap-3.5"
        >
          <div
            className="pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full blur-3xl opacity-25"
            style={{ background: colors.dot }}
          />
          <div className="relative flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="truncate text-[13px] font-medium text-[var(--text-main)]">{filename}</div>
              <div className="font-mono text-[10px] text-[var(--text-muted)] mt-0.5">
                {sizeStr} · {formatTime(duration)}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {onDownload && (
                <button onClick={onDownload} className="btn-icon !h-8 !w-8" title="Download WAV" aria-label="Download WAV">
                  <Download className="h-3.5 w-3.5" />
                </button>
              )}
              {onClear && (
                <button
                  onClick={onClear}
                  className="btn-icon !h-8 !w-8 hover:!text-[var(--danger)] hover:!border-[var(--danger)]/50"
                  title="Remove"
                  aria-label="Remove file"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="relative flex items-center gap-3.5">
            <motion.button
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.94 }}
              onClick={() => wsRef.current?.playPause()}
              disabled={!ready}
              aria-label={playing ? "Pause" : "Play"}
              className="h-10 w-10 shrink-0 rounded-full flex items-center justify-center text-[#070830] disabled:opacity-40 transition-shadow"
              style={{ background: colors.progress, boxShadow: playing ? `0 0 24px ${colors.dot}` : "none" }}
            >
              {playing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current translate-x-[1px]" />}
            </motion.button>
            <div className="flex-1 min-w-0">
              <div ref={containerRef} className="w-full" />
              <div className="flex justify-between font-mono text-[9px] text-[var(--text-faint)] mt-1">
                <span>{formatTime(time)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>
          </div>
        </motion.div>
      ) : (
        <div
          role={onFile ? "button" : undefined}
          tabIndex={onFile ? 0 : undefined}
          onKeyDown={(e) => {
            if (onFile && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              openPicker();
            }
          }}
          onDragOver={(e) => {
            if (!onFile) return;
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (onFile && e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]);
          }}
          onClick={onFile ? openPicker : undefined}
          className={`group relative overflow-hidden rounded-xl border border-dashed min-h-[132px] flex items-center justify-center transition-all duration-300 ${
            onFile
              ? "cursor-pointer border-[var(--border-strong)] hover:border-[var(--accent-strong)] hover:bg-[rgba(143,155,255,0.05)]"
              : "border-[var(--border-main)] bg-[rgba(6,8,30,0.35)]"
          } ${isDragging ? "!border-[var(--accent-strong)] bg-[rgba(143,155,255,0.08)] scale-[0.99]" : ""}`}
        >
          <div className="flex flex-col items-center gap-2.5 px-6 text-center">
            <div className="flex items-end gap-[3px] h-5" aria-hidden>
              {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                <span
                  key={i}
                  className="w-[2px] rounded-full transition-all duration-500 group-hover:animate-pulse"
                  style={{
                    height: `${[30, 60, 90, 55, 100, 45, 70][i]}%`,
                    background: colors.dot,
                    opacity: onFile ? 0.7 : 0.3,
                  }}
                />
              ))}
            </div>
            <div className="text-[13px] text-[var(--text-main)] flex items-center gap-2">
              {onFile && <Upload className="h-3.5 w-3.5 text-[var(--text-muted)]" />}
              {onFile ? "Drop a file or click to upload" : emptyLabel ?? "No signal loaded"}
            </div>
            {hint && <p className="text-[11.5px] text-[var(--text-muted)] max-w-[260px] leading-snug">{hint}</p>}
            {onFile && <p className="label-mono !text-[8.5px] !text-[var(--text-faint)]">WAV · MP3 · M4A · MP4 · FLAC · OGG</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds)) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
