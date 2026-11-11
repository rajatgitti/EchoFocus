"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Check, ChevronDown, Copy, Languages, RotateCw } from "lucide-react";
import type { ExtractMeta } from "../lib/api";

type Props = {
  meta: ExtractMeta;
  selectedLanguage: string;
  onLanguageChange: (lang: string) => void;
  onRegenerate: () => void;
  isRegenerating: boolean;
  onCopy: () => void;
  copied: boolean;
  onExport: (format: "txt" | "srt") => void;
};

const LANG_LABEL: Record<string, string> = {
  en: "English",
  hi: "Hindi (हिन्दी)",
  ur: "Urdu (اردو)",
};

export function TranscriptCard({
  meta,
  selectedLanguage,
  onLanguageChange,
  onRegenerate,
  isRegenerating,
  onCopy,
  copied,
  onExport,
}: Props) {
  const [showWords, setShowWords] = useState(false);
  const detected = meta.detected_language || "en";
  const isUrdu = detected === "ur" || selectedLanguage === "ur";
  const words = meta.words ?? [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      className="glass rounded-2xl p-5 md:p-6"
    >
      <div className="flex flex-wrap items-center gap-3 justify-between pb-4 mb-4 border-b border-[var(--border-main)]">
        <div>
          <div className="label-mono">Whisper ASR transcript</div>
          <div className="mt-1 font-mono text-[11px] text-[var(--text-faint)]">
            Detected <span className="text-[var(--accent-strong)]">{LANG_LABEL[detected] ?? detected.toUpperCase()}</span>
            <span className="mx-2">·</span>
            {isUrdu ? "Perso-Arabic (RTL)" : detected === "hi" ? "Devanagari (LTR)" : "Latin (LTR)"}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 rounded-md border border-[var(--border-main)] px-2.5 py-1.5">
            <Languages className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            <select
              value={selectedLanguage}
              onChange={(e) => onLanguageChange(e.target.value)}
              className="bg-transparent font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-main)] outline-none cursor-pointer"
              title="Spoken language"
            >
              <option value="auto" className="bg-[#0b0d2e]">Auto detect</option>
              <option value="en" className="bg-[#0b0d2e]">English</option>
              <option value="hi" className="bg-[#0b0d2e]">Hindi</option>
              <option value="ur" className="bg-[#0b0d2e]">Urdu</option>
            </select>
          </label>
          <button onClick={onRegenerate} disabled={isRegenerating} className="btn-outline !py-1.5">
            <RotateCw className={`h-3 w-3 ${isRegenerating ? "animate-spin" : ""}`} />
            {isRegenerating ? "Transcribing" : "Regenerate"}
          </button>
          <button onClick={onCopy} className="btn-icon !h-8 !w-8" title="Copy text" aria-label="Copy transcript">
            {copied ? <Check className="h-3.5 w-3.5 text-[var(--accent-mint)]" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
          <button onClick={() => onExport("txt")} className="btn-outline !py-1.5 !px-2.5">TXT</button>
          <button onClick={() => onExport("srt")} className="btn-outline !py-1.5 !px-2.5">SRT</button>
        </div>
      </div>

      <p
        dir={isUrdu ? "rtl" : "ltr"}
        className={`text-[clamp(1.05rem,1.6vw,1.35rem)] font-light leading-relaxed text-[var(--text-main)] ${isUrdu ? "text-right font-serif" : ""}`}
      >
        &ldquo;{meta.transcript}&rdquo;
      </p>

      {words.length > 0 && (
        <div className="mt-5">
          <button
            onClick={() => setShowWords((v) => !v)}
            className="label-mono flex items-center gap-1.5 hover:!text-[var(--text-main)] transition-colors"
          >
            Word-level confidence · {words.length} tokens
            <ChevronDown className={`h-3 w-3 transition-transform ${showWords ? "rotate-180" : ""}`} />
          </button>
          {showWords && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              dir={isUrdu ? "rtl" : "ltr"}
              className="mt-3 flex flex-wrap gap-1.5 max-h-40 overflow-y-auto"
            >
              {words.map((w, idx) => {
                const p = Math.round(w.probability * 100);
                const tone =
                  p >= 70
                    ? "border-[var(--accent-mint)]/30 text-[var(--accent-mint)] bg-[var(--accent-mint)]/5"
                    : p >= 40
                    ? "border-amber-300/30 text-amber-200 bg-amber-300/5"
                    : "border-[var(--danger)]/30 text-[var(--danger)] bg-[var(--danger)]/5";
                return (
                  <span
                    key={idx}
                    className={`rounded px-1.5 py-0.5 font-mono text-[10.5px] border ${tone}`}
                    title={`${w.start}s – ${w.end}s · ${p}%`}
                  >
                    {w.word.trim()} <span className="opacity-50 text-[8.5px]">{p}</span>
                  </span>
                );
              })}
            </motion.div>
          )}
        </div>
      )}
    </motion.div>
  );
}
