"use client";

import { useState, useCallback, useRef, useEffect } from "react";

type RecordingState = "idle" | "recording" | "processing";

interface TranscribeResponse {
  text?: string;
  error?: string;
  details?: string;
}

interface TokenGrantResponse {
  token?: string;
  scheme?: "bearer" | "token";
  fallback?: boolean;
  error?: string;
}

interface DeepgramStreamMessage {
  type?: string;
  is_final?: boolean;
  channel?: {
    alternatives?: Array<{
      transcript?: string;
    }>;
  };
}

interface BrowserSpeechRecognitionAlternative {
  transcript: string;
}

interface BrowserSpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  [index: number]: BrowserSpeechRecognitionAlternative | undefined;
}

interface BrowserSpeechRecognitionEvent {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: BrowserSpeechRecognitionResult | undefined;
  };
}

interface BrowserSpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type BrowserSpeechRecognitionCtor = new () => BrowserSpeechRecognition;

function getBrowserSpeechRecognitionCtor(): BrowserSpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const win = window as unknown as {
    SpeechRecognition?: BrowserSpeechRecognitionCtor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionCtor;
  };
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null;
}

export interface UseAudioRecordingOptions {
  /**
   * Called continuously as speech is transcribed in real time. Receives the
   * cumulative transcript for the current recording session (finalized
   * segments + live interim text).
   */
  onTranscript?: (transcript: string) => void;
}

const DEEPGRAM_WS_URL =
  "wss://api.deepgram.com/v1/listen?model=nova-3&interim_results=true&smart_format=true&punctuate=true&language=en&endpointing=300";

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("loadend", () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      if (base64) {
        resolve(base64);
      } else {
        reject(new Error("Failed to convert blob to base64"));
      }
    });
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(blob);
  });
}

function getSupportedMimeType(): string {
  const mimeTypes = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg",
    "audio/wav",
  ];
  for (const mimeType of mimeTypes) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType;
    }
  }
  return "";
}

export function useAudioRecording(options?: UseAudioRecordingOptions) {
  const [state, setState] = useState<RecordingState>("idle");
  const [error, setError] = useState<string | null>(null);

  const onTranscriptRef = useRef(options?.onTranscript);
  onTranscriptRef.current = options?.onTranscript;

  const isRecordingRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const mimeTypeRef = useRef<string>("");

  // Live Deepgram WebSocket streaming state
  const wsRef = useRef<WebSocket | null>(null);
  const wsConnectedRef = useRef(false);
  const pendingChunksRef = useRef<Blob[]>([]);
  const finalTranscriptRef = useRef<string>("");
  const interimTranscriptRef = useRef<string>("");
  const keepAliveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Live browser SpeechRecognition state (used when Deepgram token grant is unavailable)
  const speechRecRef = useRef<BrowserSpeechRecognition | null>(null);
  const usingSpeechRecRef = useRef(false);

  const cleanupLiveSocket = useCallback(() => {
    if (keepAliveTimerRef.current) {
      clearInterval(keepAliveTimerRef.current);
      keepAliveTimerRef.current = null;
    }
    const ws = wsRef.current;
    wsRef.current = null;
    wsConnectedRef.current = false;
    pendingChunksRef.current = [];
    if (
      ws &&
      (ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CONNECTING)
    ) {
      try {
        ws.close();
      } catch {
        // Ignore close error
      }
    }
  }, []);

  const cleanupSpeechRecognition = useCallback(() => {
    const rec = speechRecRef.current;
    speechRecRef.current = null;
    usingSpeechRecRef.current = false;
    if (rec) {
      try {
        rec.stop();
      } catch {
        // Ignore stop error
      }
    }
  }, []);

  useEffect(() => {
    return () => {
      isRecordingRef.current = false;
      cleanupLiveSocket();
      cleanupSpeechRecognition();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [cleanupLiveSocket, cleanupSpeechRecognition]);

  const emitTranscript = useCallback(() => {
    const combined = [finalTranscriptRef.current, interimTranscriptRef.current]
      .filter((part) => part.length > 0)
      .join(" ");
    onTranscriptRef.current?.(combined);
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    finalTranscriptRef.current = "";
    interimTranscriptRef.current = "";
    audioChunksRef.current = [];
    pendingChunksRef.current = [];
    wsConnectedRef.current = false;
    usingSpeechRecRef.current = false;

    try {
      // Request a short-lived Deepgram JWT for real-time WebSocket streaming.
      let tokenData: TokenGrantResponse | null = null;
      try {
        const tokenRes = await fetch("/api/transcribe/token", {
          method: "POST",
        });
        if (tokenRes.ok) {
          tokenData = (await tokenRes.json()) as TokenGrantResponse;
        }
      } catch {
        tokenData = null;
      }

      const canUseDeepgramWs = Boolean(tokenData?.token && !tokenData.fallback);

      // Path 1: Deepgram Nova-3 live WebSocket streaming
      if (canUseDeepgramWs && tokenData?.token) {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        streamRef.current = stream;

        const mimeType = getSupportedMimeType();
        mimeTypeRef.current = mimeType;

        const protocol = tokenData.scheme ?? "bearer";
        const ws = new WebSocket(DEEPGRAM_WS_URL, [protocol, tokenData.token]);
        wsRef.current = ws;

        ws.addEventListener("open", () => {
          wsConnectedRef.current = true;
          for (const chunk of pendingChunksRef.current) {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(chunk);
            }
          }
          pendingChunksRef.current = [];

          keepAliveTimerRef.current = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "KeepAlive" }));
            }
          }, 8000);
        });

        ws.addEventListener("message", (event) => {
          if (typeof event.data !== "string") return;
          try {
            const msg = JSON.parse(event.data) as DeepgramStreamMessage;
            if (msg.type !== "Results") return;
            const transcript =
              msg.channel?.alternatives?.[0]?.transcript?.trim() ?? "";
            if (msg.is_final) {
              if (transcript) {
                finalTranscriptRef.current = finalTranscriptRef.current
                  ? `${finalTranscriptRef.current} ${transcript}`
                  : transcript;
              }
              interimTranscriptRef.current = "";
              emitTranscript();
            } else {
              interimTranscriptRef.current = transcript;
              emitTranscript();
            }
          } catch {
            // Ignore non-JSON frames
          }
        });

        ws.addEventListener("error", () => {
          if (!wsConnectedRef.current) {
            cleanupLiveSocket();
          }
        });

        const mediaRecorder = new MediaRecorder(
          stream,
          mimeType ? { mimeType } : undefined,
        );
        mediaRecorderRef.current = mediaRecorder;

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size === 0) return;
          audioChunksRef.current.push(event.data);

          const activeWs = wsRef.current;
          if (activeWs) {
            if (activeWs.readyState === WebSocket.OPEN) {
              activeWs.send(event.data);
            } else if (activeWs.readyState === WebSocket.CONNECTING) {
              pendingChunksRef.current.push(event.data);
            }
          }
        };

        mediaRecorder.start(250);
        isRecordingRef.current = true;
        setState("recording");
        return;
      }

      // Path 2: Native browser real-time SpeechRecognition (instant word-by-word
      // streaming into the composer without waiting for stop).
      const SpeechRecognitionCtor = getBrowserSpeechRecognitionCtor();
      if (SpeechRecognitionCtor && onTranscriptRef.current) {
        const recognition = new SpeechRecognitionCtor();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-US";
        speechRecRef.current = recognition;
        usingSpeechRecRef.current = true;

        recognition.addEventListener("result", (rawEvent) => {
          const event = rawEvent as unknown as BrowserSpeechRecognitionEvent;
          let interim = "";
          for (let i = event.resultIndex; i < event.results.length; i += 1) {
            const result = event.results[i];
            const transcript = result?.[0]?.transcript?.trim() ?? "";
            if (!transcript) continue;
            if (result?.isFinal) {
              finalTranscriptRef.current = finalTranscriptRef.current
                ? `${finalTranscriptRef.current} ${transcript}`
                : transcript;
            } else {
              interim = interim ? `${interim} ${transcript}` : transcript;
            }
          }
          interimTranscriptRef.current = interim;
          emitTranscript();
        });

        recognition.addEventListener("error", (rawEvent) => {
          const errCode = (rawEvent as unknown as { error?: string }).error;
          if (errCode === "not-allowed" || errCode === "service-not-allowed") {
            isRecordingRef.current = false;
            cleanupSpeechRecognition();
            setError(
              "Microphone access denied. Please allow microphone access to use voice input.",
            );
            setState("idle");
          }
        });

        recognition.addEventListener("end", () => {
          // Chrome/Safari can end recognition after a brief silence; auto-restart
          // while the user is still actively recording.
          if (isRecordingRef.current && speechRecRef.current === recognition) {
            try {
              recognition.start();
            } catch {
              // Ignore restart error if already stopping
            }
          }
        });

        recognition.start();
        isRecordingRef.current = true;
        setState("recording");
        return;
      }

      // Path 3: Batch MediaRecorder + `/api/transcribe` fallback (e.g. Firefox)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = getSupportedMimeType();
      mimeTypeRef.current = mimeType;

      const mediaRecorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start();
      isRecordingRef.current = true;
      setState("recording");
    } catch (err) {
      isRecordingRef.current = false;
      cleanupLiveSocket();
      cleanupSpeechRecognition();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      const message = err instanceof Error ? err.message : String(err);
      if (
        message.includes("Permission denied") ||
        message.includes("NotAllowedError")
      ) {
        setError(
          "Microphone access denied. Please allow microphone access to use voice input.",
        );
      } else {
        setError(`Failed to start recording: ${message}`);
      }
      setState("idle");
    }
  }, [cleanupLiveSocket, cleanupSpeechRecognition, emitTranscript]);

  const stopRecording = useCallback(async (): Promise<string | null> => {
    if (state !== "recording") {
      return null;
    }

    isRecordingRef.current = false;

    // If using live browser SpeechRecognition, stop immediately (text is already live in composer)
    if (usingSpeechRecRef.current) {
      cleanupSpeechRecognition();
      setState("idle");
      return null;
    }

    const mediaRecorder = mediaRecorderRef.current;
    if (!mediaRecorder) {
      setState("idle");
      return null;
    }

    return new Promise((resolve) => {
      mediaRecorder.onstop = async () => {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;

        const usedLiveStreaming = wsConnectedRef.current;
        const ws = wsRef.current;

        if (usedLiveStreaming) {
          if (ws && ws.readyState === WebSocket.OPEN) {
            try {
              ws.send(JSON.stringify({ type: "CloseStream" }));
            } catch {
              // Ignore send error
            }
            await new Promise((resolve) => setTimeout(resolve, 350));
          }
          cleanupLiveSocket();
          setState("idle");
          resolve(null);
          return;
        }

        // Batch fallback via `/api/transcribe`
        cleanupLiveSocket();
        setState("processing");

        const mimeType = mimeTypeRef.current || "audio/webm";
        const audioBlob = new Blob(audioChunksRef.current, {
          type: mimeType,
        });

        try {
          const base64Audio = await blobToBase64(audioBlob);

          const response = await fetch("/api/transcribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              audio: base64Audio,
              mimeType,
            }),
          });

          const data = (await response.json()) as TranscribeResponse;

          if (!response.ok) {
            setError(data.error ?? "Transcription failed");
            setState("idle");
            resolve(null);
            return;
          }

          setState("idle");
          resolve(data.text ?? null);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          setError(`Transcription failed: ${message}`);
          setState("idle");
          resolve(null);
        }
      };

      mediaRecorder.stop();
    });
  }, [state, cleanupLiveSocket, cleanupSpeechRecognition]);

  const toggleRecording = useCallback(async (): Promise<string | null> => {
    if (state === "recording") {
      return stopRecording();
    } else if (state === "idle") {
      await startRecording();
      return null;
    }
    return null;
  }, [state, startRecording, stopRecording]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    state,
    error,
    clearError,
    startRecording,
    stopRecording,
    toggleRecording,
    isRecording: state === "recording",
    isProcessing: state === "processing",
  };
}
