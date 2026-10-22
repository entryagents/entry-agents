"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  DevServerLaunchResponse,
  DevServerStatusResponse,
} from "@/app/api/sessions/[sessionId]/dev-server/route";

export type DevServerLaunchState =
  | { status: "idle" }
  | { status: "starting" }
  | { status: "stopping"; info: DevServerLaunchResponse }
  | { status: "error"; message: string }
  | { status: "ready"; info: DevServerLaunchResponse };

export interface DevServerControls {
  state: DevServerLaunchState;
  menuLabel: string;
  menuDetail: string | null;
  showStopAction: boolean;
  handlePrimaryAction: () => Promise<void>;
  handleStopAction: () => Promise<void>;
}

type EnsureSandboxReady = () => Promise<boolean>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getErrorMessage(body: unknown, fallback: string): string {
  if (!isRecord(body) || typeof body.error !== "string") {
    return fallback;
  }

  return body.error;
}

function normalizeUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

function parseLaunchResponse(body: unknown): DevServerLaunchResponse | null {
  if (!isRecord(body)) {
    return null;
  }

  const { packagePath, port, url } = body;
  if (
    typeof packagePath !== "string" ||
    typeof port !== "number" ||
    !Number.isFinite(port) ||
    typeof url !== "string" ||
    url.trim().length === 0
  ) {
    return null;
  }

  return {
    packagePath,
    port,
    url: normalizeUrl(url),
  };
}

export function useDevServer({
  sessionId,
  canRun,
  ensureSandboxReady: _ensureSandboxReady,
}: {
  sessionId: string;
  canRun: boolean;
  ensureSandboxReady?: EnsureSandboxReady;
}): DevServerControls {
  const [state, setState] = useState<DevServerLaunchState>({ status: "idle" });
  const stoppedManuallyRef = useRef(false);

  useEffect(() => {
    stoppedManuallyRef.current = false;
    setState({ status: "idle" });
  }, [sessionId]);

  useEffect(() => {
    if (!canRun) {
      return;
    }

    let cancelled = false;

    async function syncAndKeepAlive() {
      if (cancelled || stoppedManuallyRef.current) {
        return;
      }

      try {
        const response = await fetch(`/api/sessions/${sessionId}/dev-server`, {
          cache: "no-store",
        });
        if (!response.ok || cancelled || stoppedManuallyRef.current) {
          return;
        }

        const body = (await response.json()) as DevServerStatusResponse;
        if (cancelled || stoppedManuallyRef.current) {
          return;
        }

        if (
          body.running &&
          typeof body.packagePath === "string" &&
          typeof body.port === "number" &&
          typeof body.url === "string"
        ) {
          setState({
            status: "ready",
            info: {
              packagePath: body.packagePath,
              port: body.port,
              url: normalizeUrl(body.url),
            },
          });
        }
      } catch {
        // Silent background check; explicit user clicks still surface errors.
      }
    }

    void syncAndKeepAlive();
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void syncAndKeepAlive();
      }
    }, 15_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [canRun, sessionId]);

  const openDevServerUrl = useCallback((url: string) => {
    window.open(normalizeUrl(url), "_blank", "noopener,noreferrer");
  }, []);

  const handlePrimaryAction = useCallback(async () => {
    if (state.status === "ready") {
      openDevServerUrl(state.info.url);
      void fetch(`/api/sessions/${sessionId}/dev-server`, {
        cache: "no-store",
      }).catch(() => undefined);
      return;
    }

    if (state.status === "starting" || state.status === "stopping") {
      return;
    }

    stoppedManuallyRef.current = false;
    setState({ status: "starting" });

    try {
      const response = await fetch(`/api/sessions/${sessionId}/dev-server`, {
        method: "POST",
      });
      const body: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(getErrorMessage(body, "Failed to launch dev server"));
      }

      const launchResponse = parseLaunchResponse(body);
      if (!launchResponse) {
        throw new Error("Invalid dev server response");
      }

      setState({
        status: "ready",
        info: launchResponse,
      });
      openDevServerUrl(launchResponse.url);
    } catch (error) {
      console.error("Failed to launch dev server:", error);
      setState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Failed to launch dev server",
      });
    }
  }, [openDevServerUrl, sessionId, state]);

  const handleStopAction = useCallback(async () => {
    if (state.status !== "ready") {
      return;
    }

    stoppedManuallyRef.current = true;
    setState({ status: "stopping", info: state.info });

    try {
      const response = await fetch(`/api/sessions/${sessionId}/dev-server`, {
        method: "DELETE",
      });
      const body: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(getErrorMessage(body, "Failed to stop dev server"));
      }

      setState({ status: "idle" });
    } catch (error) {
      console.error("Failed to stop dev server:", error);
      setState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Failed to stop dev server",
      });
    }
  }, [sessionId, state]);

  const menuLabel =
    state.status === "ready"
      ? state.info.packagePath === "root"
        ? "Open Dev Server"
        : `Open ${state.info.packagePath}`
      : state.status === "starting"
        ? "Starting Dev Server..."
        : state.status === "stopping"
          ? "Stopping Dev Server..."
          : state.status === "error"
            ? "Retry Dev Server"
            : "Run Dev Server";
  const menuDetail =
    state.status === "ready" || state.status === "stopping"
      ? state.info.url
      : state.status === "error"
        ? state.message
        : null;
  const showStopAction =
    canRun && (state.status === "ready" || state.status === "stopping");

  return {
    state,
    menuLabel,
    menuDetail,
    showStopAction,
    handlePrimaryAction,
    handleStopAction,
  } as const;
}
