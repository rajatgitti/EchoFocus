"use client";

import { Moon, Sun, RefreshCw, HelpCircle, Database, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { motion } from "motion/react";

export function Header({ 
  onReset, 
  onStartTour,
  onToggleLibrary,
  libraryOpen,
  id
}: { 
  onReset?: () => void;
  onStartTour?: () => void;
  onToggleLibrary?: () => void;
  libraryOpen?: boolean;
  id?: string;
}) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("echofocus-theme") || localStorage.getItem("vanta-theme");
    if (stored === "dark") {
      setIsDark(true);
      document.documentElement.classList.add("dark");
    } else if (stored === "light") {
      setIsDark(false);
      document.documentElement.classList.remove("dark");
    } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      setIsDark(true);
      document.documentElement.classList.add("dark");
    }
  }, []);

  const toggleDark = () => {
    const next = !isDark;
    setIsDark(next);
    if (next) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("echofocus-theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("echofocus-theme", "light");
    }
  };

  return (
    <header id={id} className="px-8 py-2.5 flex items-center justify-between bg-transparent border-b border-[var(--border-main)]/30">
      <motion.div 
        whileHover="hover"
        className="flex items-center gap-3.5 cursor-default group"
      >
          <motion.div 
            variants={{
              hover: { 
                scale: 1.08,
                rotate: -4
              }
            }}
            className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 via-orange-500/10 to-transparent border border-amber-500/30 flex items-center justify-center shadow-lg shadow-amber-500/5"
          >
            <svg 
              width="26" 
              height="26" 
              viewBox="0 0 100 100" 
              className="text-amber-500"
            >
              <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="6" opacity="0.3" strokeDasharray="6 6" />
              <path 
                d="M20 50 Q 35 20, 50 50 T 80 50" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="8" 
                strokeLinecap="round"
              />
              <circle cx="50" cy="50" r="8" fill="currentColor" />
            </svg>
          </motion.div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-[26px] font-black tracking-[0.08em] text-[var(--text-main)] uppercase leading-none">
                ECHOFOCUS
              </span>
              <span className="text-[9px] font-mono font-bold tracking-widest px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-500 uppercase">
                RESEARCH MVP
              </span>
            </div>
            <span className="text-[11px] font-medium tracking-wide text-[var(--text-muted)] opacity-80">
              Focus on the Voice That Matters.
            </span>
          </div>
      </motion.div>

      <div className="flex items-center gap-2">
        {onToggleLibrary && (
          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onToggleLibrary}
            className={`px-3.5 py-2 rounded-lg border font-mono-heading text-[11px] font-black tracking-widest flex items-center gap-2 transition-all ${
              libraryOpen 
                ? "bg-amber-500 text-black border-amber-500 shadow-md shadow-amber-500/20" 
                : "border-[var(--border-main)] text-[var(--text-main)] hover:border-amber-500/50 bg-[var(--bg-card)]"
            }`}
            title="Open Audio Library"
          >
            <Database className="h-4 w-4" />
            <span>LIBRARY</span>
          </motion.button>
        )}

        <motion.button 
          whileHover={{ 
            scale: 1.08, 
            backgroundColor: "rgba(255, 191, 0, 0.15)",
            color: "#FFBF00"
          }}
          whileTap={{ scale: 0.92 }}
          onClick={onStartTour}
          className="vanta-btn w-10 h-10 flex items-center justify-center transition-colors"
          aria-label="Start guided tour"
          title="Guided Walkthrough"
        >
          <HelpCircle className="h-5 w-5" />
        </motion.button>

        {onReset && (
          <motion.button 
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92, rotate: 180 }}
            onClick={onReset}
            className="vanta-btn w-10 h-10 flex items-center justify-center transition-colors"
            aria-label="Reset workspace"
            title="Reset Workspace"
          >
            <RefreshCw className="h-4 w-4" />
          </motion.button>
        )}

        <motion.button 
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.92 }}
          onClick={toggleDark}
          className="vanta-btn w-10 h-10 flex items-center justify-center transition-colors"
          aria-label="Toggle theme"
          title={isDark ? "Switch to light theme" : "Switch to dark theme"}
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </motion.button>
      </div>
    </header>
  );
}
