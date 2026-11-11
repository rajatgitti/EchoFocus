"use client";

import { motion, AnimatePresence } from "motion/react";
import { AudioWaveform, Fingerprint, Layers, Mic, Check } from "lucide-react";

type Props = {
  id?: string;
  canExtract: boolean;
  status: "idle" | "running" | "error";
  hasResult: boolean;
  progress: number;
  stage: string;
  error: string | null;
  backend: "checking" | "online" | "offline";
  onExtract: () => void;
};

// These mirror the model's real forward pass: encoder -> speaker fingerprint ->
// conditioned mask -> decoder.
const STAGES = [
  { label: "Encode", desc: "Waveform into learned features", icon: AudioWaveform },
  { label: "Identify", desc: "Fingerprint the target voice", icon: Fingerprint },
  { label: "Separate", desc: "Mask out every other speaker", icon: Layers },
  { label: "Reconstruct", desc: "Features back into audio + ASR", icon: Mic },
];

const R = 74;
const CIRC = 2 * Math.PI * R;

export function PipelineEngine({ id, canExtract, status, hasResult, progress, stage, error, backend, onExtract }: Props) {
  const running = status === "running";
  const active = running ? Math.min(STAGES.length - 1, Math.floor((progress / 100) * STAGES.length)) : -1;
  const done = !running && hasResult;
  const shown = running ? progress : done ? 100 : 0;

  const headline = status === "error" ? "Failed" : running ? `${Math.round(progress)}%` : done ? "Done" : "Ready";
  const sub =
    status === "error"
      ? "Extraction failed"
      : running
      ? stage || "Processing"
      : done
      ? "Voice isolated"
      : backend === "offline"
      ? "Engine offline"
      : canExtract
      ? "Signals loaded"
      : "Awaiting signals";

  return (
    <div id={id} className="glass rounded-2xl p-5 md:p-6 flex flex-col items-center gap-6 h-full">
      <div className="w-full flex items-center justify-between">
        <span className="label-mono">Extraction engine</span>
        <span className="label-mono !text-[var(--text-faint)]">Conv-TasNet · ECAPA</span>
      </div>

      {/* progress dial */}
      <div className="relative h-[190px] w-[190px]">
        <svg viewBox="0 0 180 180" className="absolute inset-0 h-full w-full -rotate-90">
          <defs>
            <linearGradient id="dial" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#8f9bff" />
              <stop offset="100%" stopColor={status === "error" ? "#ff7a8a" : done ? "#8ff0cf" : "#f2b8ff"} />
            </linearGradient>
          </defs>
          <circle cx="90" cy="90" r={R} fill="none" stroke="rgba(140,150,255,0.12)" strokeWidth="1.5" />
          <circle cx="90" cy="90" r={R + 9} fill="none" stroke="rgba(140,150,255,0.08)" strokeWidth="1" strokeDasharray="1 5" />
          <motion.circle
            cx="90"
            cy="90"
            r={R}
            fill="none"
            stroke="url(#dial)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={CIRC}
            animate={{ strokeDashoffset: CIRC * (1 - shown / 100) }}
            transition={{ duration: running ? 0.2 : 0.8, ease: "easeOut" }}
            style={{ filter: "drop-shadow(0 0 6px rgba(160,170,255,0.6))" }}
          />
        </svg>
        {running && (
          <motion.div
            className="absolute inset-0 rounded-full border border-[var(--accent)]/40"
            animate={{ scale: [1, 1.18], opacity: [0.6, 0] }}
            transition={{ repeat: Infinity, duration: 1.6, ease: "easeOut" }}
          />
        )}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <AnimatePresence mode="wait">
            <motion.span
              key={headline}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25 }}
              className={`text-[34px] font-light tracking-tight ${status === "error" ? "text-[var(--danger)]" : ""}`}
            >
              {headline}
            </motion.span>
          </AnimatePresence>
          <span className="label-mono !text-[8.5px] mt-1 max-w-[130px] leading-snug">{sub}</span>
        </div>
      </div>

      {/* stage list */}
      <ol className="w-full flex flex-col gap-1.5">
        {STAGES.map((s, i) => {
          const isActive = i === active;
          const isDone = done || (running && i < active);
          return (
            <li
              key={s.label}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 border transition-all duration-500 ${
                isActive
                  ? "border-[var(--border-strong)] bg-[var(--panel-hi)]"
                  : "border-transparent"
              }`}
            >
              <span
                className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors duration-500 ${
                  isActive
                    ? "border-[var(--accent-strong)] text-[var(--accent-strong)]"
                    : isDone
                    ? "border-[var(--accent-mint)]/50 text-[var(--accent-mint)]"
                    : "border-[var(--border-main)] text-[var(--text-faint)]"
                }`}
              >
                {isDone ? <Check className="h-3.5 w-3.5" /> : <s.icon className={`h-3.5 w-3.5 ${isActive ? "animate-pulse" : ""}`} />}
              </span>
              <div className="min-w-0">
                <div className={`font-mono text-[10.5px] uppercase tracking-[0.16em] ${isActive || isDone ? "text-[var(--text-main)]" : "text-[var(--text-muted)]"}`}>
                  <span className="text-[var(--text-faint)] mr-2">0{i + 1}</span>
                  {s.label}
                </div>
                <div className="text-[11px] text-[var(--text-faint)] truncate">{s.desc}</div>
              </div>
            </li>
          );
        })}
      </ol>

      {/* action */}
      <div className="w-full mt-auto flex flex-col gap-2.5">
        <motion.button
          id="echofocus-extract-btn"
          whileHover={canExtract ? { scale: 1.015 } : undefined}
          whileTap={canExtract ? { scale: 0.985 } : undefined}
          disabled={!canExtract}
          onClick={onExtract}
          className={`relative w-full overflow-hidden rounded-xl py-3.5 font-mono text-[11px] uppercase tracking-[0.24em] transition-all duration-300 ${
            canExtract
              ? "bg-[var(--accent-strong)] text-[#070830] shadow-[0_0_40px_rgba(143,155,255,0.35)] hover:bg-white"
              : "border border-[var(--border-main)] text-[var(--text-faint)] cursor-not-allowed"
          }`}
        >
          {canExtract && (
            <motion.span
              aria-hidden
              className="absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/50 to-transparent"
              animate={{ x: ["0%", "400%"] }}
              transition={{ repeat: Infinity, duration: 2.6, ease: "easeInOut", repeatDelay: 1.2 }}
            />
          )}
          <span className="relative">{running ? "Extracting…" : status === "error" ? "Try again" : "Extract voice"}</span>
        </motion.button>
        <p
          className={`min-h-[2.4em] text-center text-[11px] leading-snug ${
            status === "error" || error || backend === "offline" ? "text-[var(--danger)]/90" : "text-[var(--text-faint)]"
          }`}
        >
          {status === "error" || error
            ? error ?? "Something went wrong. Please check the audio files."
            : backend === "offline"
            ? "Start the backend: python server.py --port 8000"
            : running
            ? "Separating and transcribing — this can take a moment on CPU."
            : "Load a reference and a mixture to begin."}
        </p>
      </div>
    </div>
  );
}
