"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Play, Trash2, X } from "lucide-react";
import type { SessionItem } from "../lib/api";

type Props = {
  open: boolean;
  onClose: () => void;
  sessions: SessionItem[];
  loading: boolean;
  loadingSessionId: string | null;
  onLoad: (item: SessionItem) => void;
  onDelete: (id: string) => void;
};

export function LibraryModal({ open, onClose, sessions, loading, loadingSessionId, onLoad, onDelete }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#02020f]/70 backdrop-blur-md p-4 md:p-8"
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Session library"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="glass w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl overflow-hidden"
          >
            <div className="flex items-start justify-between gap-4 p-5 border-b border-[var(--border-main)]">
              <div>
                <div className="label-mono">Session library</div>
                <h3 className="mt-1 text-[22px] font-light tracking-tight">Every extraction, kept.</h3>
                <p className="mt-1 text-[12px] text-[var(--text-muted)]">Saved on the server in SQLite. Reload any session into the studio.</p>
              </div>
              <button onClick={onClose} className="btn-icon" aria-label="Close library">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {loading ? (
                <div className="py-14 text-center label-mono">Loading sessions…</div>
              ) : sessions.length === 0 ? (
                <div className="py-14 text-center label-mono">No sessions yet — extract a voice to save one.</div>
              ) : (
                sessions.map((item, i) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.04, 0.4) }}
                    className="rounded-xl border border-[var(--border-main)] bg-[rgba(6,8,30,0.45)] p-4 hover:border-[var(--border-strong)] transition-colors"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-[10px] text-[var(--accent-strong)]">{item.id}</span>
                        <span className="font-mono text-[10px] text-[var(--text-faint)]">{new Date(item.timestamp).toLocaleString()}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-[var(--accent-mint)]">{Math.round(item.confidence * 100)}% conf</span>
                        <button
                          onClick={() => onDelete(item.id)}
                          className="btn-icon !h-7 !w-7 hover:!text-[var(--danger)] hover:!border-[var(--danger)]/50"
                          title="Delete session"
                          aria-label="Delete session"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1 font-mono text-[10.5px] text-[var(--text-muted)]">
                      <div className="truncate"><span className="text-[var(--text-faint)]">Mix </span>{item.mixture_filename}</div>
                      <div className="truncate"><span className="text-[var(--text-faint)]">Ref </span>{item.reference_filename}</div>
                    </div>
                    {item.transcript && (
                      <p className="mt-2.5 text-[12.5px] font-light text-[var(--text-main)]/90 line-clamp-2">&ldquo;{item.transcript}&rdquo;</p>
                    )}
                    <div className="mt-3 flex justify-end">
                      <button
                        disabled={loadingSessionId === item.id}
                        onClick={() => onLoad(item)}
                        className="btn-outline !py-1.5"
                      >
                        <Play className="h-3 w-3" />
                        {loadingSessionId === item.id ? "Loading" : "Load into studio"}
                      </button>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
