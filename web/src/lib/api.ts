// API client for the EchoFocus inference backend (built on VANTA extraction foundation).

const DEFAULT_BASE = "http://127.0.0.1:8000";

export function apiBase(): string {
  if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_ECHOFOCUS_API) {
    return process.env.NEXT_PUBLIC_ECHOFOCUS_API;
  }
  if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_VANTA_API) {
    return process.env.NEXT_PUBLIC_VANTA_API;
  }
  return DEFAULT_BASE;
}

export type WordConfidence = {
  word: string;
  start: number;
  end: number;
  probability: number;
};

export type ExtractMeta = {
  sampleRate: number;
  inputSeconds: number;
  outputSeconds: number;
  truncated: boolean;
  transcript?: string;
  confidence?: number;
  words?: WordConfidence[];
  sessionId?: string;
  createdAt?: string;
  similarities?: number[][];
  selected?: number[];
  backend?: string;
};

type ExtractJSON = {
  extracted_wav_b64: string;
  residue_wav_b64: string;
  sample_rate: number;
  input_seconds: number;
  output_seconds: number;
  truncated: boolean;
  transcript?: string;
  confidence?: number;
  words?: WordConfidence[];
  session_id?: string;
  created_at?: string;
  similarities?: number[][];
  selected?: number[];
  backend?: string;
};

export type SessionItem = {
  id: string;
  timestamp: string;
  mixture_filename: string;
  reference_filename: string;
  input_seconds: number;
  output_seconds: number;
  status: string;
  transcript: string;
  confidence: number;
};

export async function extract(
  mixture: File,
  enrollment: File,
): Promise<{ extracted: Blob; residue: Blob; meta: ExtractMeta }> {
  const body = new FormData();
  body.append("mixture", mixture);
  body.append("enrollment", enrollment);

  const url = `${apiBase()}/extract?include_residue=true`;

  let resp: Response;
  try {
    resp = await fetch(url, { method: "POST", body });
  } catch {
    throw new Error("Could not reach the EchoFocus server. Please ensure the backend is running on port 8000.");
  }

  if (!resp.ok) {
    const raw = await resp.text().catch(() => "");
    let detail = raw;
    try {
      const parsed = JSON.parse(raw) as { detail?: string };
      if (parsed?.detail) detail = parsed.detail;
    } catch {
      /* not JSON */
    }
    if (resp.status === 413) {
      throw new Error("That file is too large. Please use a shorter clip.");
    }
    throw new Error(detail || `Extraction failed (${resp.status}).`);
  }

  const data = (await resp.json()) as ExtractJSON;
  return {
    extracted: b64ToBlob(data.extracted_wav_b64, "audio/wav"),
    residue: b64ToBlob(data.residue_wav_b64, "audio/wav"),
    meta: {
      sampleRate: data.sample_rate,
      inputSeconds: data.input_seconds,
      outputSeconds: data.output_seconds,
      truncated: data.truncated,
      transcript: data.transcript,
      confidence: data.confidence,
      words: data.words,
      sessionId: data.session_id,
      createdAt: data.created_at,
      similarities: data.similarities,
      selected: data.selected,
      backend: data.backend,
    },
  };
}

export async function health(): Promise<{ ok: boolean; device?: string; app?: string; whisper?: string }> {
  try {
    const resp = await fetch(`${apiBase()}/health`, { cache: "no-store" });
    if (!resp.ok) return { ok: false };
    const data = await resp.json();
    return {
      ok: data.status === "ok",
      device: data.device,
      app: data.app,
      whisper: data.whisper_asr,
    };
  } catch {
    return { ok: false };
  }
}

export async function fetchLibrary(): Promise<SessionItem[]> {
  try {
    const resp = await fetch(`${apiBase()}/library`, { cache: "no-store" });
    if (!resp.ok) return [];
    return await resp.json();
  } catch {
    return [];
  }
}

export async function fetchSessionAudio(sessionId: string, track: "extracted" | "residue" | "mixture" | "reference"): Promise<Blob | null> {
  try {
    const resp = await fetch(`${apiBase()}/library/${sessionId}/audio/${track}`);
    if (!resp.ok) return null;
    return await resp.blob();
  } catch {
    return null;
  }
}

export async function deleteSession(sessionId: string): Promise<boolean> {
  try {
    const resp = await fetch(`${apiBase()}/library/${sessionId}`, { method: "DELETE" });
    return resp.ok;
  } catch {
    return false;
  }
}

function b64ToBlob(b64: string, type: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes.buffer as ArrayBuffer], { type });
}
