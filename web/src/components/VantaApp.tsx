"use client";

import { useCallback, useEffect, useState } from "react";
import { AudioCard } from "./AudioCard";
import { EngineCenter } from "./EngineCenter";
import { Header } from "./Header";
import { TipsCard } from "./TipsCard";
import {
  extract,
  retranscribe,
  health,
  fetchLibrary,
  fetchSessionAudio,
  deleteSession,
  type ExtractMeta,
  type SessionItem,
} from "../lib/api";
import {
  Activity,
  FileText,
  Copy,
  Check,
  Download,
  Database,
  Trash2,
  ChevronDown,
  ChevronUp,
  X,
  Play,
  Languages,
  RotateCw,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";

type Result = {
  extracted: Blob;
  residue: Blob;
  meta: ExtractMeta;
};

type Status = "idle" | "running" | "error";

export function VantaApp() {
  const [enrollment, setEnrollment] = useState<File | null>(null);
  const [mixture, setMixture] = useState<File | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [backend, setBackend] = useState<"checking" | "online" | "offline">("checking");
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sampleLoading, setSampleLoading] = useState(false);

  // Multilingual Whisper state
  const [selectedLanguage, setSelectedLanguage] = useState<string>("auto");
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [copiedTranscript, setCopiedTranscript] = useState(false);
  const [showWordDetails, setShowWordDetails] = useState(false);

  // Library modal state
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [librarySessions, setLibrarySessions] = useState<SessionItem[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    health().then((h) => {
      if (cancelled) return;
      setBackend(h.ok ? "online" : "offline");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshLibrary = useCallback(async () => {
    setLoadingLibrary(true);
    const items = await fetchLibrary();
    setLibrarySessions(items);
    setLoadingLibrary(false);
  }, []);

  useEffect(() => {
    if (libraryOpen) {
      refreshLibrary();
    }
  }, [libraryOpen, refreshLibrary]);

  useEffect(() => {
    if (status !== "running") {
      setProgress(0);
      setStage("");
      return;
    }

    const DURATION = 4500;
    const start = Date.now();

    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      const progressValue = Math.min(95, (elapsed / DURATION) * 100);
      setProgress(progressValue);

      if (progressValue < 25) setStage("EXTRACTING ACOUSTIC FEATURES...");
      else if (progressValue < 50) setStage("FINGERPRINTING TARGET VOICE...");
      else if (progressValue < 75) setStage("SEPARATING TARGET FROM MIX...");
      else setStage("RECONSTRUCTING CLEAN AUDIO & ASR...");

      if (elapsed >= DURATION) clearInterval(interval);
    }, 16);

    return () => clearInterval(interval);
  }, [status]);

  const canRun = !!(mixture && enrollment) && status !== "running";

  const run = useCallback(async () => {
    if (!mixture || !enrollment) return;
    setStatus("running");
    setResult(null);
    setError(null);
    try {
      const startTime = Date.now();
      const r = await extract(mixture, enrollment, selectedLanguage);
      const elapsed = Date.now() - startTime;

      const minDuration = 4500;
      if (elapsed < minDuration) {
        await new Promise((resolve) => setTimeout(resolve, minDuration - elapsed));
      }

      setProgress(100);
      setStage("EXTRACTION COMPLETE");
      setTimeout(() => {
        setResult(r);
        setStatus("idle");
      }, 600);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Extraction failed. Please try again.");
      setStatus("error");
    }
  }, [mixture, enrollment, selectedLanguage]);

  const handleRegenerateTranscript = useCallback(async () => {
    if (!result) return;
    setIsRegenerating(true);
    try {
      const updated = await retranscribe(result.meta.sessionId, selectedLanguage, result.extracted);
      setResult((prev) =>
        prev
          ? {
              ...prev,
              meta: {
                ...prev.meta,
                transcript: updated.transcript,
                confidence: updated.confidence,
                detected_language: updated.detected_language,
                words: updated.words,
              },
            }
          : null
      );
    } catch (err) {
      console.error("Regenerate transcript failed:", err);
    } finally {
      setIsRegenerating(false);
    }
  }, [result, selectedLanguage]);

  const loadSample = useCallback(async () => {
    setSampleLoading(true);
    setError(null);
    try {
      const grab = async (name: string) => {
        const r = await fetch(`/sample/${name}`);
        if (!r.ok) throw new Error("sample unavailable");
        return new File([await r.blob()], name, { type: "audio/wav" });
      };
      const [ref, mix] = await Promise.all([grab("reference.wav"), grab("mixture.wav")]);
      setResult(null);
      setEnrollment(ref);
      setMixture(mix);
    } catch {
      setError("Could not load the example. Please upload your own audio.");
    } finally {
      setSampleLoading(false);
    }
  }, []);

  const download = useCallback((blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 0);
  }, []);

  const exportTranscript = useCallback(
    (format: "txt" | "srt") => {
      if (!result?.meta.transcript) return;
      let content = "";
      if (format === "txt") {
        content = `EchoFocus Extracted Transcript\nDate: ${new Date().toISOString()}\nLanguage: ${result.meta.detected_language || selectedLanguage}\nConfidence: ${Math.round((result.meta.confidence ?? 0) * 100)}%\n\n${result.meta.transcript}`;
      } else {
        const words = result.meta.words || [];
        if (words.length > 0) {
          content = words
            .map((w, idx) => {
              const formatTime = (s: number) => {
                const ms = Math.floor((s % 1) * 1000);
                const secs = Math.floor(s % 60);
                const mins = Math.floor((s / 60) % 60);
                const hrs = Math.floor(s / 3600);
                return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
              };
              return `${idx + 1}\n${formatTime(w.start)} --> ${formatTime(w.end)}\n${w.word.trim()}\n`;
            })
            .join("\n");
        } else {
          content = `1\n00:00:00,000 --> 00:00:10,000\n${result.meta.transcript}\n`;
        }
      }
      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      download(blob, `echofocus_transcript_${result.meta.detected_language || "speech"}.${format}`);
    },
    [result, selectedLanguage, download]
  );

  const copyTranscriptText = useCallback(() => {
    if (!result?.meta.transcript) return;
    navigator.clipboard.writeText(result.meta.transcript);
    setCopiedTranscript(true);
    setTimeout(() => setCopiedTranscript(false), 2000);
  }, [result]);

  const loadSessionFromLibrary = useCallback(
    async (item: SessionItem) => {
      setLoadingSessionId(item.id);
      try {
        const [extBlob, resBlob] = await Promise.all([
          fetchSessionAudio(item.id, "extracted"),
          fetchSessionAudio(item.id, "residue"),
        ]);
        if (!extBlob || !resBlob) {
          throw new Error("Could not retrieve stored audio tracks.");
        }
        setResult({
          extracted: extBlob,
          residue: resBlob,
          meta: {
            sampleRate: 16000,
            inputSeconds: item.input_seconds,
            outputSeconds: item.output_seconds,
            truncated: false,
            transcript: item.transcript,
            confidence: item.confidence,
            sessionId: item.id,
            createdAt: item.timestamp,
          },
        });
        setLibraryOpen(false);
      } catch (err) {
        console.error("Failed to load session:", err);
      } finally {
        setLoadingSessionId(null);
      }
    },
    []
  );

  const handleDeleteSession = useCallback(
    async (id: string) => {
      const ok = await deleteSession(id);
      if (ok) {
        setLibrarySessions((prev) => prev.filter((s) => s.id !== id));
      }
    },
    []
  );

  const reset = useCallback(() => {
    setEnrollment(null);
    setMixture(null);
    setResult(null);
    setStatus("idle");
    setProgress(0);
    setStage("");
    setError(null);
  }, []);

  const startTour = useCallback(() => {
    const driverObj = driver({
      showProgress: true,
      popoverClass: "driverjs-theme",
      steps: [
        {
          element: "#echofocus-header",
          popover: {
            title: "Welcome to EchoFocus",
            description:
              "Focus on the Voice That Matters. An advanced research platform isolating any target voice from multi-speaker mixtures, with integrated Multilingual Whisper ASR and genuine confidence estimation.",
            side: "bottom",
            align: "start",
          },
        },
        {
          element: "#echofocus-inputs",
          popover: {
            title: "Audio Inputs",
            description:
              "Upload a short clean reference clip of the speaker you want to isolate, plus the noisy mixture.",
            side: "right",
            align: "start",
          },
        },
        {
          element: "#echofocus-reference",
          popover: {
            title: "Speaker Reference",
            description:
              "A 5-second sample of the target voice. Our ECAPA-TDNN encoder extracts a speaker identity embedding.",
            side: "right",
            align: "center",
          },
        },
        {
          element: "#echofocus-noise",
          popover: {
            title: "Noisy Mixture",
            description:
              "The complex multi-speaker recording with overlapping speech and background noise.",
            side: "right",
            align: "center",
          },
        },
        {
          element: "#echofocus-tour-center",
          popover: {
            title: "Extraction & Inference Engine",
            description:
              "Runs the trained Conv-TasNet separator conditioned on speaker identity, followed by Multilingual Whisper ASR.",
            side: "top",
            align: "center",
          },
        },
        {
          element: "#echofocus-clean",
          popover: {
            title: "Isolated Target Voice",
            description:
              "The isolated voice is rendered here with interactive waveform playback, multilingual transcript, and WAV download.",
            side: "left",
            align: "start",
          },
        },
        {
          element: "#echofocus-residue",
          popover: {
            title: "Interference Residue",
            description:
              "Everything removed from the mixture (interfering speakers and noise) is preserved in the residue channel.",
            side: "left",
            align: "start",
          },
        },
      ],
    });
    driverObj.drive();
  }, []);

  const confPercent = Math.round((result?.meta.confidence ?? 0) * 100);
  const detectedLang = result?.meta.detected_language || "en";
  const isUrdu = detectedLang === "ur" || selectedLanguage === "ur";
  const detectedLangLabel =
    detectedLang === "en"
      ? "English"
      : detectedLang === "hi"
      ? "Hindi (हिन्दी)"
      : detectedLang === "ur"
      ? "Urdu (اردو)"
      : detectedLang.toUpperCase();

  return (
    <div className="min-h-screen xl:h-screen w-full flex flex-col bg-[var(--bg-app)] xl:overflow-hidden font-sans">
      <Header
        onReset={reset}
        onStartTour={startTour}
        onToggleLibrary={() => setLibraryOpen((prev) => !prev)}
        libraryOpen={libraryOpen}
        id="echofocus-header"
      />

      <main className="flex-1 grid grid-cols-1 xl:grid-cols-[450px_1fr_450px] lg:grid-cols-[380px_1fr_380px] xl:overflow-hidden px-4 md:px-8 xl:px-12 gap-8 xl:gap-10 pt-6 pb-40 xl:pb-6">
        {/* INPUTS COLUMN */}
        <section id="echofocus-inputs" className="flex flex-col h-auto xl:h-full xl:overflow-hidden">
          <div className="mb-3 shrink-0 flex items-start justify-between gap-3">
            <div>
              <h2 className="font-mono-heading text-[18px] font-black tracking-widest text-[var(--text-main)] mb-0.5 uppercase">
                INPUT SIGNALS
              </h2>
              <p className="text-[12px] text-[var(--text-muted)] font-medium">
                Enroll target voice & upload noisy mixture.
              </p>
            </div>
            <button
              onClick={loadSample}
              disabled={sampleLoading || status === "running"}
              className="shrink-0 px-3 py-1.5 rounded-lg border border-[var(--border-main)] font-mono-heading text-[10px] font-black tracking-widest text-[var(--text-muted)] hover:text-[var(--text-main)] hover:border-[var(--text-main)]/40 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {sampleLoading ? "LOADING..." : "LOAD SAMPLE"}
            </button>
          </div>

          <div className="flex-1 flex flex-col gap-2 min-h-0">
            <div className="h-[200px] xl:h-auto xl:flex-1 xl:min-h-[180px]">
              <AudioCard
                id="echofocus-reference"
                heading="TARGET SPEAKER REFERENCE"
                hint="Clean solo clip (~5s) of the voice you want to isolate."
                source={enrollment}
                variant="brown"
                onClear={() => setEnrollment(null)}
                onFile={(f) => setEnrollment(f)}
                className="h-full"
              />
            </div>

            <div className="h-[200px] xl:h-auto xl:flex-1 xl:min-h-[180px]">
              <AudioCard
                id="echofocus-noise"
                heading="NOISY MIXTURE AUDIO"
                hint="Overlapping multi-speaker audio or speech in noise."
                source={mixture}
                variant="red"
                onClear={() => setMixture(null)}
                onFile={(f) => setMixture(f)}
                className="h-full"
              />
            </div>

            <div className="hidden xl:block h-20 shrink-0 mt-1">
              <TipsCard />
            </div>
          </div>
        </section>

        {/* ENGINE COLUMN */}
        <section className="flex flex-col h-auto xl:h-full min-h-[450px] xl:overflow-hidden">
          <EngineCenter
            id="echofocus-engine"
            canExtract={!!canRun}
            status={status}
            progress={progress}
            stage={stage}
            onExtract={run}
          />
        </section>

        {/* OUTPUTS COLUMN */}
        <section id="echofocus-outputs" className="flex flex-col h-auto xl:h-full xl:overflow-hidden">
          <div className="mb-3 shrink-0 flex items-center justify-between">
            <div>
              <h2 className="font-mono-heading text-[18px] font-black tracking-widest text-[var(--text-main)] mb-0.5 uppercase">
                ISOLATED OUTPUTS
              </h2>
              <p className="text-[12px] text-[var(--text-muted)] font-medium">
                Extracted speaker, residue, and transcript.
              </p>
            </div>
            {result?.meta.confidence !== undefined && (
              <span
                className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-bold tracking-wider border ${
                  confPercent >= 70
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                    : confPercent >= 50
                    ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                    : "bg-red-500/10 border-red-500/30 text-red-400"
                }`}
              >
                {confPercent}% CONFIDENCE
              </span>
            )}
          </div>

          <div className="flex-1 flex flex-col gap-2 min-h-0 overflow-y-auto pr-1">
            <div className="h-[180px] xl:h-[180px] shrink-0">
              <AudioCard
                id="echofocus-clean"
                heading="ISOLATED TARGET VOICE"
                source={result?.extracted ?? null}
                variant="green"
                onDownload={result ? () => download(result.extracted, "echofocus_extracted.wav") : undefined}
                emptyLabel="Isolated target speaker will appear here"
                className="h-full"
              />
            </div>

            <div className="h-[180px] xl:h-[180px] shrink-0">
              <AudioCard
                id="echofocus-residue"
                heading="RESIDUE (NOISE & OTHERS)"
                source={result?.residue ?? null}
                variant="purple"
                onDownload={result ? () => download(result.residue, "echofocus_residue.wav") : undefined}
                emptyLabel="Interference residue will appear here"
                className="h-full"
              />
            </div>

            {/* MULTILINGUAL WHISPER ASR TRANSCRIPTION CARD */}
            {result?.meta.transcript && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="vanta-card p-4 rounded-xl border border-[var(--border-main)]/60 bg-[var(--bg-card)] shrink-0"
              >
                {/* ASR Header with Language Selection & Controls */}
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2 pb-2 border-b border-[var(--border-main)]/30">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-amber-400" />
                    <span className="font-mono-heading text-[11px] font-black tracking-widest text-[var(--text-main)] uppercase">
                      WHISPER ASR TRANSCRIPT
                    </span>
                  </div>

                  {/* Language Selector & Regenerate Action */}
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 bg-[var(--bg-app)]/80 px-2 py-1 rounded-lg border border-[var(--border-main)]/40">
                      <Languages className="w-3.5 h-3.5 text-amber-400" />
                      <select
                        value={selectedLanguage}
                        onChange={(e) => setSelectedLanguage(e.target.value)}
                        className="bg-transparent text-[10px] font-mono font-bold text-[var(--text-main)] outline-none cursor-pointer"
                        title="Select spoken language"
                      >
                        <option value="auto" className="bg-[#1a1a1a] text-white">Auto Detect</option>
                        <option value="en" className="bg-[#1a1a1a] text-white">English (Latin)</option>
                        <option value="hi" className="bg-[#1a1a1a] text-white">Hindi (Devanagari)</option>
                        <option value="ur" className="bg-[#1a1a1a] text-white">Urdu (Perso-Arabic)</option>
                      </select>
                    </div>

                    <button
                      onClick={handleRegenerateTranscript}
                      disabled={isRegenerating}
                      className="px-2 py-1 rounded-lg border border-amber-500/30 hover:border-amber-500 bg-amber-500/10 text-amber-400 font-mono text-[9px] font-bold flex items-center gap-1 transition-all disabled:opacity-50"
                      title="Re-run ASR with selected language"
                    >
                      <RotateCw className={`w-3 h-3 ${isRegenerating ? "animate-spin" : ""}`} />
                      <span>{isRegenerating ? "TRANSCRIBING..." : "REGENERATE"}</span>
                    </button>
                  </div>

                  {/* Export and Copy Tools */}
                  <div className="flex items-center gap-1.5 ml-auto">
                    <button
                      onClick={copyTranscriptText}
                      className="p-1.5 rounded-lg border border-[var(--border-main)] hover:border-amber-400/50 text-[var(--text-muted)] hover:text-[var(--text-main)] transition-all"
                      title="Copy text"
                    >
                      {copiedTranscript ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={() => exportTranscript("txt")}
                      className="px-2 py-1 rounded-lg border border-[var(--border-main)] hover:border-amber-400/50 font-mono text-[9px] font-bold text-[var(--text-muted)] hover:text-[var(--text-main)] transition-all"
                      title="Export TXT"
                    >
                      TXT
                    </button>
                    <button
                      onClick={() => exportTranscript("srt")}
                      className="px-2 py-1 rounded-lg border border-[var(--border-main)] hover:border-amber-400/50 font-mono text-[9px] font-bold text-[var(--text-muted)] hover:text-[var(--text-main)] transition-all"
                      title="Export SRT"
                    >
                      SRT
                    </button>
                  </div>
                </div>

                {/* Detected Language Indicator */}
                <div className="flex items-center justify-between mb-2 text-[10px] font-mono text-[var(--text-muted)]">
                  <span>
                    Detected: <strong className="text-amber-400">{detectedLangLabel}</strong>
                  </span>
                  <span>Writing: <strong className="text-[var(--text-main)]">{isUrdu ? "Perso-Arabic (RTL)" : detectedLang === "hi" ? "Devanagari (LTR)" : "Latin (LTR)"}</strong></span>
                </div>

                {/* Transcript text rendered with appropriate script direction */}
                <div
                  dir={isUrdu ? "rtl" : "ltr"}
                  className={`text-[12px] leading-relaxed text-[var(--text-main)] bg-[var(--bg-app)]/50 p-2.5 rounded-lg border border-[var(--border-main)]/30 font-medium ${
                    isUrdu ? "text-right font-serif" : "text-left"
                  }`}
                >
                  &ldquo;{result.meta.transcript}&rdquo;
                </div>

                {/* Word confidence chips toggle */}
                {result.meta.words && result.meta.words.length > 0 && (
                  <div className="mt-2.5">
                    <button
                      onClick={() => setShowWordDetails((prev) => !prev)}
                      className="flex items-center gap-1.5 text-[10px] font-mono text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"
                    >
                      <span>WORD-LEVEL CONFIDENCE ({result.meta.words.length} TOKENS)</span>
                      {showWordDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>

                    {showWordDetails && (
                      <div
                        dir={isUrdu ? "rtl" : "ltr"}
                        className="mt-2 flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-1.5 rounded-lg bg-[var(--bg-app)]/40 border border-[var(--border-main)]/20"
                      >
                        {result.meta.words.map((w, idx) => {
                          const p = Math.round(w.probability * 100);
                          const color =
                            p >= 70
                              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                              : p >= 40
                              ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
                              : "bg-red-500/10 border-red-500/30 text-red-300";
                          return (
                            <span
                              key={idx}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${color}`}
                              title={`${w.start}s - ${w.end}s (Prob: ${p}%)`}
                            >
                              {w.word.trim()} <span className="opacity-60 text-[8px]">{p}%</span>
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            )}

            <div className="h-auto min-h-16 shrink-0 mt-1">
              <div className="h-full flex items-start gap-3 group/activity">
                <motion.div whileHover={{ scale: 1.2, rotate: 10 }}>
                  <Activity className="h-4 w-4 text-[var(--text-muted)] group-hover/activity:text-[var(--text-main)] transition-colors shrink-0 mt-0.5" />
                </motion.div>
                <p
                  className={`text-[11px] leading-relaxed font-medium transition-colors ${
                    result?.meta.truncated
                      ? "text-amber-400/90"
                      : "text-[var(--text-muted)] group-hover/activity:text-[var(--text-main)]"
                  }`}
                >
                  {result?.meta.truncated
                    ? `Input was truncated to ${Math.round(result.meta.outputSeconds)}s (EchoFocus inference limit: 30s).`
                    : "Extracted audio, residue signal, and multilingual transcript persist automatically in the EchoFocus Library."}
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* TOUR PROXY */}
      <div
        id="echofocus-tour-center"
        className="fixed top-[15%] bottom-[5%] left-1/2 -translate-x-1/2 w-full max-w-[520px] pointer-events-none z-[-1]"
      />

      {/* BOTTOM STATUS BAR */}
      <div className="fixed xl:absolute bottom-4 xl:bottom-8 left-1/2 -translate-x-1/2 w-full max-w-[550px] px-4 md:px-8 z-50">
        <motion.div
          id="echofocus-status-bar"
          layout
          className="vanta-card p-3 flex items-center justify-between gap-4 bg-[var(--bg-card)]/90 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.1)] border-t border-white/20"
        >
          <div className="flex items-center gap-4 group/status">
            <motion.div
              whileHover={{ scale: 1.1 }}
              className={`w-11 h-11 rounded-full border flex items-center justify-center transition-all duration-500 shadow-inner ${
                status === "running"
                  ? "bg-[var(--text-main)] text-[var(--bg-app)]"
                  : "bg-[var(--bg-app)] border-[var(--border-main)]"
              }`}
            >
              <Activity
                className={`w-6 h-6 ${
                  status === "running" ? "animate-pulse" : "text-[var(--text-muted)] opacity-50 group-hover/status:opacity-100"
                } transition-opacity`}
              />
            </motion.div>
            <div className="flex flex-col min-w-0">
              <span
                className={`font-mono-heading text-[12px] font-black tracking-widest ${
                  status === "error" ? "text-red-400" : ""
                }`}
              >
                {status === "error"
                  ? "EXTRACTION FAILED"
                  : error
                  ? "COULD NOT LOAD"
                  : status === "running"
                  ? "PROCESSING INFERENCE"
                  : backend === "offline"
                  ? "BACKEND UNREACHABLE"
                  : "READY TO EXTRACT"}
              </span>
              <span
                className={`text-[9px] font-bold opacity-80 truncate ${
                  status === "error" || backend === "offline" ? "text-red-400/80" : "text-[var(--text-muted)]"
                }`}
              >
                {status === "error" || error
                  ? error ?? "Something went wrong. Please check audio files."
                  : status === "running"
                  ? `${stage} • ${Math.round(progress)}%`
                  : backend === "offline"
                  ? "Start server: python server.py --port 8000"
                  : "Both signals will be processed simultaneously on GPU/CPU."}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              id="echofocus-extract-btn"
              disabled={!canRun}
              onClick={run}
              className={`px-6 py-2.5 rounded-lg font-mono-heading text-[11px] font-black tracking-widest transition-all ${
                status === "running"
                  ? "bg-transparent border border-[var(--border-main)] opacity-50 cursor-not-allowed"
                  : canRun
                  ? "bg-amber-500 text-black hover:bg-amber-400 hover:scale-105 active:scale-95 shadow-xl shadow-amber-500/20 font-bold"
                  : "bg-[var(--bg-app)] border border-[var(--border-main)] opacity-30 cursor-not-allowed"
              }`}
            >
              {status === "running" ? "EXTRACTING..." : status === "error" ? "TRY AGAIN" : "EXTRACT VOICE"}
            </button>
          </div>
        </motion.div>
      </div>

      {/* AUDIO LIBRARY MODAL */}
      <AnimatePresence>
        {libraryOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 md:p-8"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="vanta-card w-full max-w-2xl max-h-[85vh] flex flex-col bg-[var(--bg-card)] border border-[var(--border-main)] rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="p-4 border-b border-[var(--border-main)]/40 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Database className="w-5 h-5 text-amber-500" />
                  <div>
                    <h3 className="font-mono-heading text-[14px] font-black tracking-widest text-[var(--text-main)] uppercase">
                      PERSISTENT SESSION LIBRARY
                    </h3>
                    <p className="text-[11px] text-[var(--text-muted)] font-medium">
                      All processed recordings saved locally to SQLite. Survives server restarts.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setLibraryOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-[var(--bg-app)] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {loadingLibrary ? (
                  <div className="py-12 text-center text-[var(--text-muted)] font-mono text-[12px]">
                    LOADING SESSIONS...
                  </div>
                ) : librarySessions.length === 0 ? (
                  <div className="py-12 text-center text-[var(--text-muted)] font-mono text-[12px]">
                    NO SESSIONS SAVED YET. EXTRACT AUDIO TO PERSIST HERE.
                  </div>
                ) : (
                  librarySessions.map((item) => (
                    <div
                      key={item.id}
                      className="p-3.5 rounded-xl border border-[var(--border-main)]/40 bg-[var(--bg-app)]/60 hover:border-amber-500/40 transition-all flex flex-col gap-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                            {item.id}
                          </span>
                          <span className="text-[10px] font-mono text-[var(--text-muted)]">
                            {new Date(item.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            {Math.round(item.confidence * 100)}% CONF
                          </span>
                          <button
                            onClick={() => handleDeleteSession(item.id)}
                            className="p-1 rounded hover:bg-red-500/10 text-[var(--text-muted)] hover:text-red-400 transition-colors"
                            title="Delete record"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="text-[11px] font-mono text-[var(--text-muted)] grid grid-cols-2 gap-2">
                        <div>
                          <span className="opacity-60">Mix:</span> {item.mixture_filename}
                        </div>
                        <div>
                          <span className="opacity-60">Ref:</span> {item.reference_filename}
                        </div>
                      </div>

                      {item.transcript && (
                        <p className="text-[11px] text-[var(--text-main)] italic line-clamp-2 bg-[var(--bg-card)]/50 p-2 rounded border border-[var(--border-main)]/20">
                          &ldquo;{item.transcript}&rdquo;
                        </p>
                      )}

                      <div className="flex justify-end pt-1">
                        <button
                          disabled={loadingSessionId === item.id}
                          onClick={() => loadSessionFromLibrary(item)}
                          className="px-3 py-1 rounded-lg bg-amber-500/20 border border-amber-500/40 hover:bg-amber-500 hover:text-black font-mono text-[10px] font-bold text-amber-400 tracking-wider flex items-center gap-1.5 transition-all disabled:opacity-50"
                        >
                          <Play className="w-3 h-3" />
                          {loadingSessionId === item.id ? "LOADING..." : "LOAD INTO STUDIO"}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CLEAN PROFESSIONAL RESEARCH FOOTER */}
      <footer className="px-10 py-3.5 flex items-center justify-between border-t border-[var(--border-main)]/30 bg-transparent relative z-10 text-[10px] font-mono">
        <div className="flex items-center gap-3">
          <span className="font-bold tracking-widest text-[var(--text-main)] uppercase">
            ECHOFOCUS
          </span>
          <span className="text-[var(--text-muted)] opacity-60">•</span>
          <span className="text-[var(--text-muted)]">Focus on the Voice That Matters.</span>
        </div>

        <div className="flex items-center gap-4 text-[var(--text-muted)]">
          <span>Target Speaker Isolation & Multilingual ASR Studio</span>
          <span className="opacity-40">|</span>
          <span>MIT License</span>
        </div>
      </footer>
    </div>
  );
}
