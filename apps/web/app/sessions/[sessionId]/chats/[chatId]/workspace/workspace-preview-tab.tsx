"use client";

import {
  ArrowLeft,
  ArrowRight,
  AtSign,
  Check,
  Copy,
  ExternalLink,
  Globe,
  Info,
  Laptop,
  Loader2,
  Lock,
  Monitor,
  MoreHorizontal,
  Play,
  RotateCw,
  SlidersHorizontal,
  Smartphone,
  Square,
  Tablet,
  X,
} from "lucide-react";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { CompareSlider } from "@/components/compare/compare-slider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DevServerControls } from "../hooks/use-dev-server";
import {
  computeDeviceStage,
  isLocalPreviewUrl,
  normalizeBrowserAddress,
  PREVIEW_DEVICES,
  type PreviewDeviceMode,
  parseAddressParts,
} from "./sable-rail-helpers";

type WorkspacePreviewTabProps = {
  devServer: DevServerControls;
  sessionId: string;
  previewDeploymentTargetUrl?: string | null;
  isDeploymentStale?: boolean;
  isDeploymentFailed?: boolean;
  canRun?: boolean;
  onMentionInChat?: (mention: string) => void;
};

interface RecentVisit {
  url: string;
  at: number;
}

const RECENT_STORAGE_PREFIX = "entry:preview-recent:";
const MAX_RECENT = 8;

function readRecentVisits(sessionId: string): RecentVisit[] {
  if (typeof window === "undefined" || !sessionId) return [];
  try {
    const raw = localStorage.getItem(`${RECENT_STORAGE_PREFIX}${sessionId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is RecentVisit =>
        Boolean(x) &&
        typeof x === "object" &&
        typeof (x as RecentVisit).url === "string",
    );
  } catch {
    return [];
  }
}

function writeRecentVisits(sessionId: string, visits: RecentVisit[]) {
  if (typeof window === "undefined" || !sessionId) return;
  try {
    localStorage.setItem(
      `${RECENT_STORAGE_PREFIX}${sessionId}`,
      JSON.stringify(visits.slice(0, MAX_RECENT)),
    );
  } catch {
    // ignore storage quota errors
  }
}

export function WorkspacePreviewTab({
  devServer,
  sessionId,
  previewDeploymentTargetUrl,
  isDeploymentStale: _isDeploymentStale = false,
  isDeploymentFailed: _isDeploymentFailed = false,
  canRun = true,
  onMentionInChat,
}: WorkspacePreviewTabProps) {
  const [device, setDevice] = useState<PreviewDeviceMode>("desktop");
  const [activeSource, setActiveSource] = useState<"dev-server" | "vercel">(
    "dev-server",
  );
  const [compareMode, setCompareMode] = useState(false);

  // Navigation history stack (1:1 Sable web browser tab)
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [nonce, setNonce] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadPhase, setLoadPhase] = useState<1 | 2 | 3 | 0>(0);
  const [recent, setRecent] = useState<RecentVisit[]>(() =>
    readRecentVisits(sessionId),
  );

  // Address input focus state
  const inputRef = useRef<HTMLInputElement>(null);
  const [addrFocused, setAddrFocused] = useState(false);
  const [addrDraft, setAddrDraft] = useState("");

  // Scaled device stage measurements via ResizeObserver
  const viewBoxRef = useRef<HTMLDivElement>(null);
  const [boxSize, setBoxSize] = useState({ w: 0, h: 0 });

  const isDevServerReady = devServer.state.status === "ready";
  const isDevServerStarting = devServer.state.status === "starting";
  const devServerUrl =
    devServer.state.status === "ready" ? devServer.state.info.url : null;
  const canCompare = Boolean(devServerUrl && previewDeploymentTargetUrl);

  const sourceUrl =
    activeSource === "vercel" && previewDeploymentTargetUrl
      ? previewDeploymentTargetUrl
      : (devServerUrl ?? previewDeploymentTargetUrl ?? null);

  const currentUrl =
    historyIndex >= 0 && history[historyIndex] ? history[historyIndex] : null;

  const pushUrl = useCallback(
    (rawUrl: string) => {
      const normalized = normalizeBrowserAddress(rawUrl);
      if (!normalized) {
        toast.error("Enter a valid http or https URL");
        return false;
      }
      setCompareMode(false);
      setHistory((prev) => {
        const sliced = prev.slice(0, historyIndex + 1);
        if (sliced[sliced.length - 1] === normalized) {
          setNonce((n) => n + 1);
          return sliced;
        }
        const next = [...sliced, normalized];
        setHistoryIndex(next.length - 1);
        return next;
      });
      setLoading(true);
      setLoadPhase(1);
      setRecent((prev) => {
        const next = [
          { url: normalized, at: Date.now() },
          ...prev.filter((v) => v.url !== normalized),
        ].slice(0, MAX_RECENT);
        writeRecentVisits(sessionId, next);
        return next;
      });
      return true;
    },
    [historyIndex, sessionId],
  );

  // Auto-open dev server / Vercel URL when source becomes active or source switches
  const lastAutoSourceRef = useRef<string | null>(null);
  useEffect(() => {
    if (!sourceUrl) return;
    if (lastAutoSourceRef.current === sourceUrl) return;
    lastAutoSourceRef.current = sourceUrl;
    pushUrl(sourceUrl);
  }, [sourceUrl, pushUrl]);

  // Progress bar phase timer (1 -> 2 -> 3) matching Sable .bw-load
  useEffect(() => {
    if (!loading) {
      setLoadPhase(0);
      return;
    }
    const t1 = window.setTimeout(() => setLoadPhase(2), 180);
    const t2 = window.setTimeout(() => setLoadPhase(3), 900);
    const tFailSafe = window.setTimeout(() => setLoading(false), 12000);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(tFailSafe);
    };
  }, [loading, currentUrl, nonce]);

  useLayoutEffect(() => {
    const el = viewBoxRef.current;
    if (device === "desktop" || !el) return;
    setBoxSize({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setBoxSize({
        w: Math.round(entry.contentRect.width),
        h: Math.round(entry.contentRect.height),
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [device]);

  const stageMetrics = useMemo(
    () =>
      computeDeviceStage({
        device,
        containerWidth: boxSize.w,
        containerHeight: boxSize.h,
      }),
    [boxSize.h, boxSize.w, device],
  );

  const stageStyle: CSSProperties | undefined = stageMetrics
    ? {
        width: stageMetrics.width,
        height: stageMetrics.height,
        top: stageMetrics.top,
        transform: `translateX(-50%) scale(${stageMetrics.scale})`,
      }
    : undefined;

  const parts = currentUrl ? parseAddressParts(currentUrl) : null;
  const canBack = historyIndex > 0;
  const canForward = historyIndex >= 0 && historyIndex < history.length - 1;
  const isKnownSandboxOrDeploy =
    currentUrl === devServerUrl || currentUrl === previewDeploymentTargetUrl;
  const showExternalNote =
    Boolean(currentUrl) &&
    !isKnownSandboxOrDeploy &&
    !isLocalPreviewUrl(currentUrl ?? "");

  const handleBack = () => {
    if (!canBack) return;
    setHistoryIndex((i) => Math.max(0, i - 1));
    setLoading(true);
    setLoadPhase(1);
  };

  const handleForward = () => {
    if (!canForward) return;
    setHistoryIndex((i) => Math.min(history.length - 1, i + 1));
    setLoading(true);
    setLoadPhase(1);
  };

  const handleReload = () => {
    if (!currentUrl) return;
    if (loading) {
      setLoading(false);
      return;
    }
    setNonce((n) => n + 1);
    setLoading(true);
    setLoadPhase(1);
  };

  const handleCopyUrl = async () => {
    if (!currentUrl) return;
    try {
      await navigator.clipboard.writeText(currentUrl);
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy link");
    }
  };

  const forgetRecent = (url: string) => {
    setRecent((prev) => {
      const next = prev.filter((r) => r.url !== url);
      writeRecentVisits(sessionId, next);
      return next;
    });
  };

  const deviceSpec = PREVIEW_DEVICES[device];

  return (
    <div className="rail-col bw">
      {/* 1:1 Sable .bw-bar */}
      <div className="bw-bar">
        <button
          type="button"
          className="rail-btn"
          aria-label="Back"
          title="Back"
          disabled={!canBack}
          onClick={handleBack}
        >
          <ArrowLeft size={14} strokeWidth={1.6} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="rail-btn"
          aria-label="Forward"
          title="Forward"
          disabled={!canForward}
          onClick={handleForward}
        >
          <ArrowRight size={14} strokeWidth={1.6} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="rail-btn bw-reload"
          aria-label={loading ? "Stop loading" : "Reload"}
          title={loading ? "Stop loading" : "Reload"}
          data-loading={loading ? "true" : undefined}
          disabled={!currentUrl}
          onClick={handleReload}
        >
          <RotateCw
            size={13.5}
            strokeWidth={1.6}
            className="bw-reload-a"
            aria-hidden="true"
          />
          <X
            size={13.5}
            strokeWidth={1.7}
            className="bw-reload-b"
            aria-hidden="true"
          />
        </button>

        {/* Address bar */}
        <form
          className="bw-addr"
          data-focused={addrFocused ? "true" : undefined}
          onSubmit={(e) => {
            e.preventDefault();
            if (pushUrl(addrDraft)) {
              inputRef.current?.blur();
            }
          }}
        >
          <span className="bw-addr-lead" aria-hidden="true">
            {parts?.isLocal ? (
              <Laptop size={13.5} strokeWidth={1.6} />
            ) : parts?.secure ? (
              <Lock size={13} strokeWidth={1.6} />
            ) : (
              <Globe size={13.5} strokeWidth={1.6} />
            )}
          </span>
          <input
            ref={inputRef}
            value={addrFocused ? addrDraft : ""}
            placeholder={
              currentUrl
                ? ""
                : isDevServerStarting
                  ? "Starting dev server…"
                  : "Enter URL (e.g. localhost:3000)"
            }
            aria-label="Preview address"
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            onChange={(e) => setAddrDraft(e.target.value)}
            onMouseDown={(e) => {
              if (addrFocused) return;
              e.preventDefault();
              e.currentTarget.focus();
            }}
            onFocus={(e) => {
              setAddrFocused(true);
              setAddrDraft(currentUrl ?? "");
              const el = e.currentTarget;
              requestAnimationFrame(() => {
                if (document.activeElement === el) el.select();
              });
            }}
            onBlur={() => setAddrFocused(false)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                setAddrDraft(currentUrl ?? "");
                e.currentTarget.blur();
              }
            }}
          />
          {!addrFocused && parts ? (
            <span className="bw-addr-view" aria-hidden="true">
              <span className="bw-addr-host">{parts.host}</span>
              {parts.path ? (
                <span className="bw-addr-path">{parts.path}</span>
              ) : null}
            </span>
          ) : null}
        </form>

        {/* Source pill when both dev server and deployment exist */}
        {devServerUrl && previewDeploymentTargetUrl ? (
          <div
            className="seg hidden sm:inline-flex"
            role="group"
            aria-label="Preview source"
          >
            <button
              type="button"
              className="seg-item"
              data-active={activeSource === "dev-server" || undefined}
              onClick={() => {
                setActiveSource("dev-server");
                pushUrl(devServerUrl);
              }}
            >
              Dev
            </button>
            <button
              type="button"
              className="seg-item"
              data-active={activeSource === "vercel" || undefined}
              onClick={() => {
                setActiveSource("vercel");
                pushUrl(previewDeploymentTargetUrl);
              }}
            >
              Vercel
            </button>
          </div>
        ) : null}

        {/* Dev server Start/Stop toggle */}
        {canRun ? (
          <button
            type="button"
            className="rail-btn"
            onClick={() => {
              if (isDevServerReady) {
                void devServer.handleStopAction();
              } else {
                void devServer.handlePrimaryAction();
              }
            }}
            disabled={isDevServerStarting}
            aria-label={
              isDevServerStarting
                ? "Starting dev server"
                : isDevServerReady
                  ? "Stop dev server"
                  : "Start dev server"
            }
            title={
              isDevServerStarting
                ? "Starting dev server"
                : isDevServerReady
                  ? "Stop dev server"
                  : "Start dev server"
            }
          >
            {isDevServerStarting ? (
              <Loader2
                size={13.5}
                className="animate-spin text-amber-500"
                aria-hidden="true"
              />
            ) : isDevServerReady ? (
              <Square
                size={11.5}
                strokeWidth={1.8}
                className="fill-current text-rose-500"
                aria-hidden="true"
              />
            ) : (
              <Play
                size={13}
                strokeWidth={1.8}
                className="fill-current text-emerald-500"
                aria-hidden="true"
              />
            )}
          </button>
        ) : null}

        {/* Compare toggle */}
        {canCompare ? (
          <button
            type="button"
            className="rail-btn"
            data-active={compareMode || undefined}
            onClick={() => setCompareMode((prev) => !prev)}
            aria-label={
              compareMode ? "Exit compare" : "Compare deployed vs dev server"
            }
            title={compareMode ? "Exit compare" : "Compare Deployed vs Dev"}
          >
            <SlidersHorizontal
              size={13.5}
              strokeWidth={1.6}
              aria-hidden="true"
            />
          </button>
        ) : null}

        {/* More actions + Device sizes (works cleanly on mobile and desktop) */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="rail-btn"
              aria-label="Preview options"
              title="Preview options"
            >
              <MoreHorizontal size={14} strokeWidth={1.7} aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 text-xs">
            {currentUrl ? (
              <>
                <DropdownMenuItem asChild className="cursor-pointer">
                  <a
                    href={currentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2"
                  >
                    <ExternalLink size={13} strokeWidth={1.6} />
                    <span>Open in browser</span>
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => void handleCopyUrl()}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Copy size={13} strokeWidth={1.6} />
                  <span>Copy link</span>
                </DropdownMenuItem>
                {onMentionInChat ? (
                  <DropdownMenuItem
                    onSelect={() => onMentionInChat(currentUrl)}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <AtSign size={13} strokeWidth={1.6} />
                    <span>Mention this page in chat</span>
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuSeparator />
              </>
            ) : null}

            <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
              Device size
            </DropdownMenuLabel>
            <DropdownMenuItem
              onSelect={() => setDevice("desktop")}
              className="flex items-center justify-between cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <Monitor size={13} strokeWidth={1.6} />
                <span>Desktop</span>
              </span>
              {device === "desktop" && <Check size={12} />}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => setDevice("tablet")}
              className="flex items-center justify-between cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <Tablet size={13} strokeWidth={1.6} />
                <span>Tablet · 768×1024</span>
              </span>
              {device === "tablet" && <Check size={12} />}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => setDevice("phone")}
              className="flex items-center justify-between cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <Smartphone size={13} strokeWidth={1.6} />
                <span>Phone · 375×812</span>
              </span>
              {device === "phone" && <Check size={12} />}
            </DropdownMenuItem>

            {devServerUrl && previewDeploymentTargetUrl ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => {
                    setActiveSource("dev-server");
                    pushUrl(devServerUrl);
                  }}
                  className="flex items-center justify-between cursor-pointer"
                >
                  <span>Use Dev server</span>
                  {activeSource === "dev-server" && <Check size={12} />}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    setActiveSource("vercel");
                    pushUrl(previewDeploymentTargetUrl);
                  }}
                  className="flex items-center justify-between cursor-pointer"
                >
                  <span>Use Vercel preview</span>
                  {activeSource === "vercel" && <Check size={12} />}
                </DropdownMenuItem>
              </>
            ) : null}

            {currentUrl ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => {
                    setNonce((n) => n + 1);
                    setLoading(true);
                    setLoadPhase(1);
                  }}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <RotateCw size={13} strokeWidth={1.6} />
                  <span>Hard reload</span>
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Sable 1.5px 3-phase loading hairline */}
        <div
          className="bw-load"
          data-state={loading ? "on" : loadPhase === 0 ? undefined : "done"}
          data-phase={loading && loadPhase > 0 ? String(loadPhase) : undefined}
          aria-hidden="true"
        />
      </div>

      {showExternalNote && currentUrl ? (
        <div className="bw-note">
          <Info size={14} strokeWidth={1.6} aria-hidden="true" />
          <span className="bw-note-text">This site may not load here.</span>
          <a
            href={currentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="sable-btn-sm"
          >
            Open in browser
          </a>
        </div>
      ) : null}

      {/* Viewport / Scaled Device Stage / StartView */}
      <div
        ref={viewBoxRef}
        className="bw-view"
        data-device={stageMetrics ? device : undefined}
      >
        {stageMetrics ? (
          <div className="bw-device">
            {device === "tablet" ? (
              <Tablet size={13} strokeWidth={1.6} aria-hidden="true" />
            ) : (
              <Smartphone size={13} strokeWidth={1.6} aria-hidden="true" />
            )}
            <span className="bw-device-name">{deviceSpec.label}</span>
            <span className="num">
              {stageMetrics.width} × {stageMetrics.height}
            </span>
            {stageMetrics.pct < 100 ? (
              <span className="num">{stageMetrics.pct}%</span>
            ) : null}
            <button
              type="button"
              className="rail-btn bw-device-close"
              aria-label="Back to full width"
              title="Back to full width"
              onClick={() => setDevice("desktop")}
            >
              <X size={13} strokeWidth={1.7} aria-hidden="true" />
            </button>
          </div>
        ) : null}

        {currentUrl ? (
          <div className="bw-host" style={stageStyle}>
            {compareMode && devServerUrl && previewDeploymentTargetUrl ? (
              <CompareSlider
                beforeUrl={previewDeploymentTargetUrl}
                afterUrl={devServerUrl}
                beforeLabel="Deployed"
                afterLabel="Dev server"
                mode="iframe"
              />
            ) : (
              /* oxlint-disable react/iframe-missing-sandbox -- cross-origin sandbox/Vercel preview requires allow-same-origin alongside allow-scripts for SPA storage */
              <iframe
                key={`${historyIndex}:${nonce}:${currentUrl}`}
                src={currentUrl}
                title="Application preview"
                className="bw-frame"
                sandbox="allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts"
                onLoad={() => setLoading(false)}
              />
              /* oxlint-enable react/iframe-missing-sandbox */
            )}
          </div>
        ) : isDevServerStarting ? (
          <div className="bw-start flex flex-col items-center justify-center text-center">
            <div className="rail-loading">
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              <span>Starting dev server…</span>
            </div>
          </div>
        ) : (
          <div className="bw-start">
            {!devServerUrl && !previewDeploymentTargetUrl && !recent.length ? (
              <div className="rail-empty">
                <Globe size={22} strokeWidth={1.3} aria-hidden="true" />
                <p className="rail-empty-title">
                  {canRun ? "No pages opened yet." : "Preview unavailable"}
                </p>
                <p>
                  {canRun
                    ? "Start the dev server or type an address above."
                    : "Start or resume a workspace sandbox to preview this app."}
                </p>
                {canRun ? (
                  <button
                    type="button"
                    className="sable-btn-sm mt-2"
                    onClick={() => void devServer.handlePrimaryAction()}
                  >
                    <Play
                      size={12}
                      strokeWidth={1.8}
                      className="fill-current"
                    />
                    <span>Start dev server</span>
                  </button>
                ) : null}
              </div>
            ) : (
              <>
                {devServerUrl || previewDeploymentTargetUrl ? (
                  <section className="bw-sec" aria-label="In this session">
                    <h3 className="rail-h bw-h">In this session</h3>
                    <ul className="bw-list">
                      {devServerUrl ? (
                        <li>
                          <button
                            type="button"
                            className="bw-row"
                            onClick={() => pushUrl(devServerUrl)}
                          >
                            <span className="bw-row-lead">
                              <Laptop size={14} strokeWidth={1.6} />
                            </span>
                            <span className="bw-row-title num">
                              {parseAddressParts(devServerUrl).host}
                            </span>
                            <span className="bw-row-sub">Dev server</span>
                            <ArrowRight size={13} className="bw-row-go" />
                          </button>
                        </li>
                      ) : null}
                      {previewDeploymentTargetUrl ? (
                        <li>
                          <button
                            type="button"
                            className="bw-row"
                            onClick={() => {
                              setActiveSource("vercel");
                              pushUrl(previewDeploymentTargetUrl);
                            }}
                          >
                            <span className="bw-row-lead">
                              <Globe size={14} strokeWidth={1.6} />
                            </span>
                            <span className="bw-row-title">
                              {
                                parseAddressParts(previewDeploymentTargetUrl)
                                  .host
                              }
                            </span>
                            <span className="bw-row-sub">Deployed</span>
                            <ArrowRight size={13} className="bw-row-go" />
                          </button>
                        </li>
                      ) : null}
                    </ul>
                  </section>
                ) : canRun ? (
                  <div className="mb-3 px-2">
                    <button
                      type="button"
                      className="sable-btn-sm w-full justify-center"
                      onClick={() => void devServer.handlePrimaryAction()}
                    >
                      <Play
                        size={12}
                        strokeWidth={1.8}
                        className="fill-current"
                      />
                      <span>Start dev server</span>
                    </button>
                  </div>
                ) : null}

                {recent.length > 0 ? (
                  <section className="bw-sec" aria-label="Recent">
                    <h3 className="rail-h bw-h">Recent</h3>
                    <ul className="bw-list">
                      {recent.map((v) => {
                        const p = parseAddressParts(v.url);
                        return (
                          <li
                            key={v.url}
                            className="rail-row-host flex items-center"
                          >
                            <button
                              type="button"
                              className="bw-row"
                              onClick={() => pushUrl(v.url)}
                            >
                              <span className="bw-row-lead">
                                {p.isLocal ? (
                                  <Laptop size={14} strokeWidth={1.6} />
                                ) : (
                                  <Globe size={14} strokeWidth={1.6} />
                                )}
                              </span>
                              <span className="bw-row-title">{p.host}</span>
                              {p.path ? (
                                <span className="bw-row-sub rail-row-deco">
                                  {p.path}
                                </span>
                              ) : null}
                            </button>
                            <span className="rail-row-acts">
                              <button
                                type="button"
                                className="rail-btn"
                                aria-label="Remove from recent"
                                onClick={() => forgetRecent(v.url)}
                              >
                                <X size={12} strokeWidth={1.7} />
                              </button>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ) : null}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
