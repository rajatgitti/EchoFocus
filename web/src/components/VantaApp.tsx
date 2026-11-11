"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "motion/react";
import { Activity } from "lucide-react";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";

import { AudioCard } from "./AudioCard";
import { Hero } from "./Hero";
import { LibraryModal } from "./LibraryModal";
import { Logo, Nav } from "./Nav";
import { ParticleField, type FieldMode } from "./ParticleField";
import { PipelineEngine } from "./PipelineEngine";
import { TranscriptCard } from "./TranscriptCard";
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

type Result = {
  extracted: Blob;
  residue: Blob;
  meta: ExtractMeta;
};

type Status = "idle" | "running" | "error";

type Sample = {
  id: string;
  label: string;
  kind: "Synthetic" | "Real meeting";
  mixture: string;
  reference: string;
  note: string;
  says?: string;
};

// Real clips: AMI Meeting Corpus (CC BY 4.0), far-field room mic. See public/sample/README.txt.
const SAMPLES: Sample[] = [
  {
    id: "demo",
    label: "Studio demo",
    kind: "Synthetic",
    mixture: "/sample/mixture.wav",
    reference: "/sample/reference.wav",
    note: "Two held-out LibriSpeech speakers with reverb and noise. Best case.",
  },
  {
    id: "ES2002a_B",
    label: "Meeting · woman among men",
    kind: "Real meeting",
    mixture: "/sample/ami/ES2002a_B_mixture.wav",
    reference: "/sample/ami/ES2002a_B_reference.wav",
    note: "AMI ES2002a, room mic. Distinct voice, so the other speaker is removed well.",
    says: "You get those ones where you can, if you like, whistle or make a really high pitched noise, they beep. Is that something we'd want to include, do you think?",
  },
  {
    id: "ES2002a_D",
    label: "Meeting · interrupted",
    kind: "Real meeting",
    mixture: "/sample/ami/ES2002a_D_mixture.wav",
    reference: "/sample/ami/ES2002a_D_reference.wav",
    note: "AMI ES2002a, room mic. A colleague cuts in with “regions and stuff”.",
    says: "Well right away I'm wondering if there's, like with DVD players, if there are zones. Frequencies or something.",
  },
  {
    id: "IS1009a_B",
    label: "Meeting · four women",
    kind: "Real meeting",
    mixture: "/sample/ami/IS1009a_B_mixture.wav",
    reference: "/sample/ami/IS1009a_B_reference.wav",
    note: "AMI IS1009a, room mic. Similar voices; partial separation.",
    says: "The temperature inside the house, or for air-conditioners, or for heating system. Yes, exactly.",
  },
  {
    id: "IS1009a_D",
    label: "Meeting · hard case",
    kind: "Real meeting",
    mixture: "/sample/ami/IS1009a_D_mixture.wav",
    reference: "/sample/ami/IS1009a_D_reference.wav",
    note: "AMI IS1009a, room mic. Known failure: a similar-sounding speaker leaks through.",
    says: "Because people are silly. I mean, if it were like on top of your bookcase and you usually kept it on the coffee table.",
  },
];

const reveal = {
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" as const },
  transition: { duration: 0.9, ease: [0.22, 1, 0.36, 1] as const },
};

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
  const [sampleId, setSampleId] = useState(SAMPLES[0].id);
  const [loadedSample, setLoadedSample] = useState<Sample | null>(null);

  // Multilingual Whisper state
  const [selectedLanguage, setSelectedLanguage] = useState<string>("auto");
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [copiedTranscript, setCopiedTranscript] = useState(false);

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

  const openLibrary = useCallback(
    (open: boolean) => {
      setLibraryOpen(open);
      if (open) refreshLibrary();
    },
    [refreshLibrary],
  );

  // Simulated stage progress while the request is in flight. `run` and `reset`
  // zero it out; the engine only displays it while running.
  useEffect(() => {
    if (status !== "running") return;
    const DURATION = 4500;
    const start = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      const value = Math.min(95, (elapsed / DURATION) * 100);
      setProgress(value);
      if (value < 25) setStage("Extracting acoustic features");
      else if (value < 50) setStage("Fingerprinting target voice");
      else if (value < 75) setStage("Separating target from mix");
      else setStage("Reconstructing audio + ASR");
      if (elapsed >= DURATION) clearInterval(interval);
    }, 50);
    return () => clearInterval(interval);
  }, [status]);

  const canRun = !!(mixture && enrollment) && status !== "running";

  const run = useCallback(async () => {
    if (!mixture || !enrollment) return;
    setStatus("running");
    setProgress(0);
    setStage("");
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
      setStage("Extraction complete");
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
          : null,
      );
    } catch (err) {
      console.error("Regenerate transcript failed:", err);
    } finally {
      setIsRegenerating(false);
    }
  }, [result, selectedLanguage]);

  const scrollToStudio = () => document.getElementById("studio")?.scrollIntoView({ behavior: "smooth" });

  const loadSample = useCallback(
    async (id: string = sampleId) => {
      const s = SAMPLES.find((x) => x.id === id) ?? SAMPLES[0];
      setSampleLoading(true);
      setError(null);
      try {
        const grab = async (path: string) => {
          const r = await fetch(path);
          if (!r.ok) throw new Error("sample unavailable");
          return new File([await r.blob()], path.split("/").pop() ?? "sample.wav", { type: "audio/wav" });
        };
        const [ref, mix] = await Promise.all([grab(s.reference), grab(s.mixture)]);
        setResult(null);
        if (status === "error") setStatus("idle");
        setEnrollment(ref);
        setMixture(mix);
        setLoadedSample(s);
      } catch {
        setError("Could not load the example. Please upload your own audio.");
      } finally {
        setSampleLoading(false);
      }
    },
    [status, sampleId],
  );

  // the sample note only applies while both inputs are still that sample's files
  const activeSample =
    loadedSample &&
    mixture?.name === loadedSample.mixture.split("/").pop() &&
    enrollment?.name === loadedSample.reference.split("/").pop()
      ? loadedSample
      : null;

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
        const fmt = (s: number) => {
          const ms = Math.floor((s % 1) * 1000);
          const secs = Math.floor(s % 60);
          const mins = Math.floor((s / 60) % 60);
          const hrs = Math.floor(s / 3600);
          return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
        };
        content =
          words.length > 0
            ? words.map((w, idx) => `${idx + 1}\n${fmt(w.start)} --> ${fmt(w.end)}\n${w.word.trim()}\n`).join("\n")
            : `1\n00:00:00,000 --> 00:00:10,000\n${result.meta.transcript}\n`;
      }
      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      download(blob, `echofocus_transcript_${result.meta.detected_language || "speech"}.${format}`);
    },
    [result, selectedLanguage, download],
  );

  const copyTranscriptText = useCallback(() => {
    if (!result?.meta.transcript) return;
    navigator.clipboard.writeText(result.meta.transcript).catch(() => {});
    setCopiedTranscript(true);
    setTimeout(() => setCopiedTranscript(false), 2000);
  }, [result]);

  const loadSessionFromLibrary = useCallback(async (item: SessionItem) => {
    setLoadingSessionId(item.id);
    try {
      const [extBlob, resBlob] = await Promise.all([
        fetchSessionAudio(item.id, "extracted"),
        fetchSessionAudio(item.id, "residue"),
      ]);
      if (!extBlob || !resBlob) throw new Error("Could not retrieve stored audio tracks.");
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
      setTimeout(scrollToStudio, 150);
    } catch (err) {
      console.error("Failed to load session:", err);
    } finally {
      setLoadingSessionId(null);
    }
  }, []);

  const handleDeleteSession = useCallback(async (id: string) => {
    const ok = await deleteSession(id);
    if (ok) setLibrarySessions((prev) => prev.filter((s) => s.id !== id));
  }, []);

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
    scrollToStudio();
    const driverObj = driver({
      showProgress: true,
      popoverClass: "driverjs-theme",
      steps: [
        {
          element: "#echofocus-studio-head",
          popover: {
            title: "Welcome to EchoFocus",
            description:
              "Isolate any target voice from a multi-speaker recording, then transcribe it with multilingual Whisper ASR.",
            side: "bottom",
            align: "start",
          },
        },
        {
          element: "#echofocus-reference",
          popover: {
            title: "Speaker reference",
            description: "A ~5-second clean sample of the target voice. Our ECAPA-TDNN encoder turns it into a 192-D voice fingerprint.",
            side: "right",
            align: "center",
          },
        },
        {
          element: "#echofocus-noise",
          popover: {
            title: "Noisy mixture",
            description: "The recording with overlapping speakers and background noise.",
            side: "right",
            align: "center",
          },
        },
        {
          element: "#echofocus-engine",
          popover: {
            title: "Extraction engine",
            description: "A Conv-TasNet separator conditioned on the fingerprint masks out every other voice, then Whisper transcribes the result.",
            side: "left",
            align: "center",
          },
        },
        {
          element: "#echofocus-clean",
          popover: {
            title: "Isolated voice",
            description: "The extracted target speaker with waveform playback and WAV download.",
            side: "left",
            align: "start",
          },
        },
        {
          element: "#echofocus-residue",
          popover: {
            title: "Residue",
            description: "Everything that was removed — interfering speakers and noise.",
            side: "left",
            align: "start",
          },
        },
      ],
    });
    // let the smooth scroll settle before measuring element positions
    setTimeout(() => driverObj.drive(), 700);
  }, []);

  const fieldMode: FieldMode =
    status === "running" ? "running" : status === "error" ? "error" : result ? "done" : "idle";
  const confPercent = Math.round((result?.meta.confidence ?? 0) * 100);

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden">
      <ParticleField mode={fieldMode} />

      <Nav
        id="echofocus-header"
        backend={backend}
        libraryOpen={libraryOpen}
        onToggleLibrary={() => openLibrary(!libraryOpen)}
        onStartTour={startTour}
        onReset={reset}
      />

      <Hero
        sampleLoading={sampleLoading}
        onTrySample={async () => {
          await loadSample(SAMPLES[0].id);
          setSampleId(SAMPLES[0].id);
          scrollToStudio();
        }}
      />

      {/* ---------------- STUDIO ---------------- */}
      <section id="studio" className="relative z-10 px-4 md:px-8 xl:px-10 pt-24 pb-20 scroll-mt-4">
        <motion.div {...reveal} id="echofocus-studio-head" className="mb-8 flex flex-wrap items-end justify-between gap-6">
          <div>
            <div className="label-mono mb-3">02 — Studio</div>
            <h2 className="text-[clamp(2rem,4.5vw,3.6rem)] font-normal leading-[1] tracking-[-0.03em]">
              One voice, out of the noise.
            </h2>
            <p className="mt-3 max-w-xl text-[14px] text-[var(--text-muted)]">
              Enroll the speaker you want, drop in the mixture, and EchoFocus separates, transcribes and saves the result.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="sample-select" className="sr-only">
              Sample
            </label>
            <select
              id="sample-select"
              value={sampleId}
              onChange={(e) => setSampleId(e.target.value)}
              disabled={sampleLoading || status === "running"}
              className="sample-select"
            >
              {(["Synthetic", "Real meeting"] as const).map((kind) => (
                <optgroup key={kind} label={kind}>
                  {SAMPLES.filter((s) => s.kind === kind).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <button onClick={() => loadSample()} disabled={sampleLoading || status === "running"} className="btn-outline">
              {sampleLoading ? "Loading…" : "Load sample"}
            </button>
            <button onClick={() => openLibrary(true)} className="btn-outline">
              Library
            </button>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-[1fr_minmax(320px,380px)_1fr] gap-5">
          {/* inputs */}
          <motion.section {...reveal} id="echofocus-inputs" className="glass rounded-2xl p-5 md:p-6 flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <span className="label-mono">Input signals</span>
              <span className="label-mono !text-[var(--text-faint)]">01 / 02</span>
            </div>
            <AudioCard
              id="echofocus-reference"
              heading="Target speaker reference"
              hint="A clean solo clip (~5 s) of the voice you want to isolate."
              source={enrollment}
              variant="brown"
              onClear={() => setEnrollment(null)}
              onFile={(f) => setEnrollment(f)}
            />
            <AudioCard
              id="echofocus-noise"
              heading="Noisy mixture"
              hint="Overlapping speakers, or speech in background noise."
              source={mixture}
              variant="red"
              onClear={() => setMixture(null)}
              onFile={(f) => setMixture(f)}
            />
            {activeSample ? (
              <div className="mt-auto space-y-2 border-t border-[var(--border-main)] pt-4 text-[11.5px] leading-relaxed">
                <div className="label-mono">
                  {activeSample.kind} · {activeSample.label}
                </div>
                <p className="text-[var(--text-muted)]">{activeSample.note}</p>
                {activeSample.says && (
                  <p className="text-[var(--text-faint)]">
                    <span className="text-[var(--text-muted)]">Target actually says (human transcript): </span>
                    &ldquo;{activeSample.says}&rdquo;
                  </p>
                )}
                {activeSample.kind === "Real meeting" && (
                  <p className="text-[var(--text-faint)]">AMI Meeting Corpus, CC BY 4.0.</p>
                )}
              </div>
            ) : (
              <ul className="mt-auto space-y-1.5 border-t border-[var(--border-main)] pt-4 text-[11.5px] text-[var(--text-faint)]">
                <li>· Use a reference with only the target speaking.</li>
                <li>· Mixtures are capped at 20 s on CPU, 30 s on GPU.</li>
              </ul>
            )}
          </motion.section>

          {/* engine */}
          <motion.div {...reveal} transition={{ ...reveal.transition, delay: 0.08 }} className="lg:col-span-2 xl:col-span-1 lg:order-last xl:order-none">
            <PipelineEngine
              id="echofocus-engine"
              canExtract={canRun}
              status={status}
              hasResult={!!result}
              progress={progress}
              stage={stage}
              error={error}
              backend={backend}
              onExtract={run}
            />
          </motion.div>

          {/* outputs */}
          <motion.section
            {...reveal}
            transition={{ ...reveal.transition, delay: 0.16 }}
            id="echofocus-outputs"
            className="glass rounded-2xl p-5 md:p-6 flex flex-col gap-5"
          >
            <div className="flex items-center justify-between">
              <span className="label-mono">Isolated outputs</span>
              {result?.meta.confidence !== undefined ? (
                <span
                  className={`font-mono text-[10px] uppercase tracking-[0.16em] ${
                    confPercent >= 70 ? "text-[var(--accent-mint)]" : confPercent >= 50 ? "text-amber-200" : "text-[var(--danger)]"
                  }`}
                >
                  {confPercent}% ASR confidence
                </span>
              ) : (
                <span className="label-mono !text-[var(--text-faint)]">— / —</span>
              )}
            </div>
            <AudioCard
              id="echofocus-clean"
              heading="Isolated target voice"
              source={result?.extracted ?? null}
              variant="green"
              onDownload={result ? () => download(result.extracted, "echofocus_extracted.wav") : undefined}
              emptyLabel="The isolated speaker will appear here"
            />
            <AudioCard
              id="echofocus-residue"
              heading="Residue · noise & others"
              source={result?.residue ?? null}
              variant="purple"
              onDownload={result ? () => download(result.residue, "echofocus_residue.wav") : undefined}
              emptyLabel="Removed interference will appear here"
            />
            <div className="mt-auto flex items-start gap-2.5 border-t border-[var(--border-main)] pt-4">
              <Activity className="h-3.5 w-3.5 mt-0.5 shrink-0 text-[var(--text-faint)]" />
              <p className={`text-[11.5px] leading-relaxed ${result?.meta.truncated ? "text-amber-200/90" : "text-[var(--text-faint)]"}`}>
                {result?.meta.truncated
                  ? `Input was truncated to ${Math.round(result.meta.outputSeconds)} s (inference length limit).`
                  : "Extracted audio, residue and transcript are saved to the library automatically."}
              </p>
            </div>
          </motion.section>
        </div>

        {result?.meta.transcript && (
          <div className="mt-5">
            <TranscriptCard
              meta={result.meta}
              selectedLanguage={selectedLanguage}
              onLanguageChange={setSelectedLanguage}
              onRegenerate={handleRegenerateTranscript}
              isRegenerating={isRegenerating}
              onCopy={copyTranscriptText}
              copied={copiedTranscript}
              onExport={exportTranscript}
            />
          </div>
        )}
      </section>

      <LibraryModal
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        sessions={librarySessions}
        loading={loadingLibrary}
        loadingSessionId={loadingSessionId}
        onLoad={loadSessionFromLibrary}
        onDelete={handleDeleteSession}
      />

      <footer className="relative z-10 border-t border-[var(--border-main)] px-5 md:px-10 py-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <Logo className="h-4 w-4 text-[var(--accent-strong)]" />
          <span className="text-[13px]">echofocus</span>
          <span className="label-mono !text-[var(--text-faint)] ml-2">Focus on the voice that matters</span>
        </div>
        <div className="label-mono !text-[var(--text-faint)]">Target speaker extraction & multilingual ASR · MIT license</div>
      </footer>
    </div>
  );
}
