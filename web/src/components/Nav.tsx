"use client";

import { Database, HelpCircle, RotateCcw } from "lucide-react";
import { motion } from "motion/react";

type Props = {
  id?: string;
  backend: "checking" | "online" | "offline";
  libraryOpen: boolean;
  onToggleLibrary: () => void;
  onStartTour: () => void;
  onReset: () => void;
};

export function Logo({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <circle cx="16" cy="16" r="3.2" fill="currentColor" />
      <path d="M9.5 9.5a9.2 9.2 0 0 0 0 13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M22.5 9.5a9.2 9.2 0 0 1 0 13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" opacity="0.55" />
      <path d="M5 5.5a15.5 15.5 0 0 0 0 21" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" opacity="0.35" />
    </svg>
  );
}

export function Nav({ id, backend, libraryOpen, onToggleLibrary, onStartTour, onReset }: Props) {
  const statusColor =
    backend === "online" ? "bg-[var(--accent-mint)]" : backend === "offline" ? "bg-[var(--danger)]" : "bg-[var(--text-muted)]";

  return (
    <motion.header
      id={id}
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-x-0 top-0 z-40"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-[#03041a]/90 via-[#03041a]/50 to-transparent pointer-events-none" />
      <nav className="relative flex items-center justify-between gap-4 px-5 md:px-10 py-4">
        <div className="flex items-center gap-10">
          <a href="#top" className="flex items-center gap-2.5 text-[var(--text-main)]">
            <Logo className="h-5 w-5 text-[var(--accent-strong)]" />
            <span className="text-[15px] font-medium tracking-tight">echofocus</span>
          </a>
          <div className="hidden md:flex items-center gap-7">
            {[
              { label: "Studio", href: "#studio" },
              { label: "Pipeline", href: "#echofocus-engine" },
            ].map((l) => (
              <a
                key={l.label}
                href={l.href}
                className="label-mono !text-[9.5px] hover:!text-[var(--text-main)] transition-colors"
              >
                {l.label}
              </a>
            ))}
            <button
              onClick={onToggleLibrary}
              className={`label-mono !text-[9.5px] transition-colors hover:!text-[var(--text-main)] ${libraryOpen ? "!text-[var(--text-main)]" : ""}`}
            >
              Library
            </button>
            <button onClick={onStartTour} className="label-mono !text-[9.5px] hover:!text-[var(--text-main)] transition-colors">
              Tour
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden sm:inline-flex items-center gap-2 mr-2 label-mono !text-[9px]">
            <span className={`h-1.5 w-1.5 rounded-full ${statusColor} ${backend === "online" ? "shadow-[0_0_8px_var(--accent-mint)]" : ""}`} />
            {backend === "online" ? "Engine online" : backend === "offline" ? "Engine offline" : "Connecting"}
          </span>
          <button onClick={onToggleLibrary} className="btn-icon md:hidden" aria-label="Open library" title="Library">
            <Database className="h-4 w-4" />
          </button>
          <button onClick={onStartTour} className="btn-icon md:hidden" aria-label="Start guided tour" title="Guided tour">
            <HelpCircle className="h-4 w-4" />
          </button>
          <button onClick={onReset} className="btn-icon" aria-label="Reset workspace" title="Reset workspace">
            <RotateCcw className="h-4 w-4" />
          </button>
          <a href="#studio" className="btn-outline group">
            Open studio
            <span className="dot-blink flex gap-[3px]" aria-hidden>
              <span className="h-[3px] w-[3px] rounded-full bg-current" />
              <span className="h-[3px] w-[3px] rounded-full bg-current" />
              <span className="h-[3px] w-[3px] rounded-full bg-current" />
              <span className="h-[3px] w-[3px] rounded-full bg-current" />
            </span>
          </a>
        </div>
      </nav>
    </motion.header>
  );
}
