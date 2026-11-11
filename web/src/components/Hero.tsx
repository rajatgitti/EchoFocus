"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDown } from "lucide-react";

const CAPTIONS = [
  ["Isolated From", "Any Mixture."],
  ["Fingerprinted In", "Five Seconds."],
  ["Transcribed In", "Every Language."],
  ["Saved To Your", "Own Library."],
];

// Real figures from the trained model and pipeline (see README).
const STATS = [
  { value: "+8.45 dB", label: "Val SI-SDR gain", pos: "top-[24%] right-[7%]" },
  { value: "192-D", label: "Voice fingerprint", pos: "top-[52%] right-[24%]" },
  { value: "16 kHz", label: "Mono pipeline", pos: "top-[64%] left-[12%]" },
];

const ease = [0.22, 1, 0.36, 1] as const;

export function Hero({ onTrySample, sampleLoading }: { onTrySample: () => void; sampleLoading: boolean }) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % CAPTIONS.length), 3600);
    return () => clearInterval(t);
  }, []);

  return (
    <section id="top" className="relative z-10 h-[100svh] min-h-[620px] w-full overflow-hidden">
      <div className="hero-grid absolute inset-0 pointer-events-none" />

      {/* grid intersection marks */}
      <div className="absolute inset-0 pointer-events-none hidden md:block" aria-hidden>
        {[
          ["33.33%", "25%"], ["66.66%", "25%"], ["16.66%", "75%"], ["50%", "75%"], ["83.33%", "75%"],
        ].map(([l, t]) => (
          <span key={`${l}-${t}`} className="absolute -translate-x-1/2 -translate-y-1/2 text-[10px] leading-none text-[var(--text-faint)]" style={{ left: l, top: t }}>
            +
          </span>
        ))}
      </div>

      {/* headline */}
      <div className="absolute left-5 md:left-10 top-[17%] md:top-[15%] max-w-[90vw]">
        <h1 className="text-glow text-[clamp(2.6rem,7vw,6.2rem)] font-normal leading-[0.98] tracking-[-0.035em]">
          {["Focus On The Voice", "That Matters."].map((line, i) => (
            <span key={line} className="block overflow-hidden pb-[0.06em]">
              <motion.span
                className="block"
                initial={{ y: "105%" }}
                animate={{ y: 0 }}
                transition={{ duration: 1.1, delay: 0.25 + i * 0.12, ease }}
              >
                {line}
              </motion.span>
            </span>
          ))}
        </h1>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.8, ease }}
          className="mt-8 flex flex-wrap items-center gap-3"
        >
          <a href="#studio" className="btn-outline !bg-[var(--accent-strong)] !text-[#070830] !border-[var(--accent-strong)] hover:!bg-white">
            Launch studio
          </a>
          <button onClick={onTrySample} disabled={sampleLoading} className="btn-outline">
            {sampleLoading ? "Loading sample…" : "Try a sample"}
          </button>
        </motion.div>
      </div>

      {/* floating stat markers */}
      {STATS.map((s, i) => (
        <motion.div
          key={s.label}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 1.4 + i * 0.2, ease }}
          className={`absolute hidden lg:block ${s.pos}`}
        >
          <div className="flex items-center gap-2 font-mono text-[11px] text-[var(--text-main)]">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent-strong)] opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--accent-strong)]" />
            </span>
            {s.value}
          </div>
          <div className="label-mono !text-[8.5px] !text-[var(--text-faint)] ml-3.5 mt-0.5">{s.label}</div>
        </motion.div>
      ))}

      {/* rotating caption */}
      <div className="absolute right-5 md:right-10 bottom-[12%] md:bottom-[9%] text-right">
        <AnimatePresence mode="wait">
          <motion.p
            key={idx}
            initial={{ opacity: 0, y: 24, filter: "blur(10px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -16, filter: "blur(10px)" }}
            transition={{ duration: 0.9, ease }}
            className="text-[clamp(1.9rem,4.4vw,3.9rem)] leading-[1.02] tracking-[-0.03em]"
          >
            {CAPTIONS[idx][0]}
            <br />
            {CAPTIONS[idx][1]}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* bottom-left note */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 1.8 }}
        className="absolute left-5 md:left-10 bottom-[4%] hidden sm:block"
      >
        <div className="label-mono !text-[8.5px] !text-[var(--text-faint)] mb-1.5">Target speaker extraction · VANTA</div>
        <p className="font-mono text-[11px] leading-relaxed text-[var(--text-muted)]">
          From a noisy mixture to one clear voice —
          <br />
          separated, transcribed and saved.
        </p>
      </motion.div>

      <motion.a
        href="#studio"
        aria-label="Scroll to studio"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, y: [0, 6, 0] }}
        transition={{ opacity: { delay: 2, duration: 1 }, y: { repeat: Infinity, duration: 2.4, ease: "easeInOut" } }}
        className="absolute left-1/2 -translate-x-1/2 bottom-[3%] btn-icon !rounded-full"
      >
        <ArrowDown className="h-4 w-4" />
      </motion.a>
    </section>
  );
}
