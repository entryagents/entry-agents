"use client";

import {
  ExternalLink,
  Globe,
  Loader2,
  Monitor,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Smartphone,
  Square,
  Tablet,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { CompareSlider } from "@/components/compare/compare-slider";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { DevServerControls } from "../hooks/use-dev-server";

type ViewportMode = "desktop" | "tablet" | "mobile";

type WorkspacePreviewTabProps = {
  devServer: DevServerControls;
  sessionId: string;
  previewDeploymentTargetUrl?: string | null;
  isDeploymentStale?: boolean;
  isDeploymentFailed?: boolean;
  canRun?: boolean;
};

export function WorkspacePreviewTab({
  devServer,
  sessionId: _sessionId,
  previewDeploymentTargetUrl,
  isDeploymentStale: _isDeploymentStale = false,
  isDeploymentFailed: _isDeploymentFailed = false,
  canRun = true,
}: WorkspacePreviewTabProps) {
  const [viewport, setViewport] = useState<ViewportMode>("desktop");
  const [iframeKey, setIframeKey] = useState(0);
  const [activeSource, setActiveSource] = useState<"dev-server" | "vercel">(
    "dev-server",
  );
  const [compareMode, setCompareMode] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const isDevServerReady = devServer.state.status === "ready";
  const isDevServerStarting = devServer.state.status === "starting";
  const devServerUrl =
    devServer.state.status === "ready" ? devServer.state.info.url : null;
  const devServerPort =
    devServer.state.status === "ready" ? devServer.state.info.port : null;
  const canCompare = Boolean(devServerUrl && previewDeploymentTargetUrl);

  const currentPreviewUrl =
    activeSource === "vercel" && previewDeploymentTargetUrl
      ? previewDeploymentTargetUrl
      : devServerUrl;

  const handleReload = useCallback(() => {
    setIframeKey((prev) => prev + 1);
  }, []);

  const openInNewTab = useCallback(() => {
    if (currentPreviewUrl) {
      window.open(currentPreviewUrl, "_blank", "noopener,noreferrer");
    }
  }, [currentPreviewUrl]);

  const showDevServerToggleInBar =
    canRun &&
    (isDevServerReady || isDevServerStarting || Boolean(currentPreviewUrl));

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Browser Bar */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-muted/20 px-3 py-1.5">
        {/* Left: Reload (when active) & Source Switch */}
        <div className="flex shrink-0 items-center gap-1">
          {currentPreviewUrl ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
                  onClick={handleReload}
                  aria-label="Reload preview"
                >
                  <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.5} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Reload preview</TooltipContent>
            </Tooltip>
          ) : null}

          {previewDeploymentTargetUrl ? (
            <div className="flex items-center rounded-md border border-border bg-background/60 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setActiveSource("dev-server")}
                className={cn(
                  "rounded px-2 py-0.5 font-medium transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] cursor-pointer",
                  activeSource === "dev-server"
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Dev server
              </button>
              <button
                type="button"
                onClick={() => setActiveSource("vercel")}
                className={cn(
                  "rounded px-2 py-0.5 font-medium transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] cursor-pointer",
                  activeSource === "vercel"
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Vercel
              </button>
            </div>
          ) : null}
        </div>

        {/* Center: Address Bar Display */}
        <div className="flex min-w-0 flex-1 max-w-md items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground font-mono">
          <Globe
            className="h-3.5 w-3.5 shrink-0 opacity-60"
            strokeWidth={1.5}
          />
          <span className="truncate">
            {currentPreviewUrl ??
              (isDevServerStarting
                ? "Starting dev server"
                : "No server running")}
          </span>
          {isDevServerReady ? (
            <span className="ml-auto flex shrink-0 items-center gap-1.5 pl-2 text-[11px] font-sans font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {devServerPort ? `:${devServerPort}` : "Live"}
            </span>
          ) : null}
        </div>

        {/* Right: Viewport switcher, Server toggle & External open */}
        <div className="flex shrink-0 items-center gap-1">
          {currentPreviewUrl ? (
            <div className="hidden sm:flex items-center rounded-md border border-border p-0.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setViewport("desktop")}
                    className={cn(
                      "rounded p-1 transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] cursor-pointer",
                      viewport === "desktop"
                        ? "bg-secondary text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    aria-label="Desktop view"
                  >
                    <Monitor className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Desktop</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setViewport("tablet")}
                    className={cn(
                      "rounded p-1 transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] cursor-pointer",
                      viewport === "tablet"
                        ? "bg-secondary text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    aria-label="Tablet view"
                  >
                    <Tablet className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Tablet (768px)</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setViewport("mobile")}
                    className={cn(
                      "rounded p-1 transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] cursor-pointer",
                      viewport === "mobile"
                        ? "bg-secondary text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    aria-label="Mobile view"
                  >
                    <Smartphone className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Mobile (375px)</TooltipContent>
              </Tooltip>
            </div>
          ) : null}

          {showDevServerToggleInBar ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
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
                >
                  {isDevServerStarting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />
                  ) : isDevServerReady ? (
                    <Square
                      className="h-3 w-3 fill-current text-rose-500"
                      strokeWidth={1.5}
                    />
                  ) : (
                    <Play
                      className="h-3.5 w-3.5 fill-current text-emerald-500"
                      strokeWidth={1.5}
                    />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {isDevServerStarting
                  ? "Starting dev server"
                  : isDevServerReady
                    ? "Stop dev server"
                    : "Start dev server"}
              </TooltipContent>
            </Tooltip>
          ) : null}

          {canCompare ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={compareMode ? "secondary" : "ghost"}
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
                  onClick={() => setCompareMode((prev) => !prev)}
                  aria-label="Compare deployed vs dev server"
                >
                  <SlidersHorizontal
                    className="h-3.5 w-3.5"
                    strokeWidth={1.5}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {compareMode ? "Exit compare" : "Compare Deployed vs Dev"}
              </TooltipContent>
            </Tooltip>
          ) : null}

          {currentPreviewUrl ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
                  onClick={openInNewTab}
                  aria-label="Open preview in new tab"
                >
                  <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.5} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Open in new tab</TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      </div>

      {/* Main Preview Container */}
      <div className="relative flex flex-1 items-center justify-center overflow-auto bg-muted/15 p-2 sm:p-4">
        {currentPreviewUrl ? (
          <div
            className={cn(
              "h-full overflow-hidden rounded-lg border border-border bg-background transition-[width] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]",
              viewport === "desktop" && "w-full",
              viewport === "tablet" && "w-[768px] max-w-full",
              viewport === "mobile" && "w-[375px] max-w-full",
            )}
          >
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
                key={iframeKey}
                ref={iframeRef}
                src={currentPreviewUrl}
                title="Application preview"
                className="h-full w-full border-0 bg-background"
                sandbox="allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts"
              />
              /* oxlint-enable react/iframe-missing-sandbox */
            )}
          </div>
        ) : isDevServerStarting ? (
          <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <div>
              <p className="text-sm font-medium text-foreground">
                Starting dev server
              </p>
              <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                Booting the application inside the sandbox
              </p>
            </div>
          </div>
        ) : (
          <div className="flex w-full max-w-xs flex-col items-center justify-center gap-4 rounded-xl border border-border/80 bg-card p-6 text-center">
            <Globe
              className="h-5 w-5 text-muted-foreground"
              strokeWidth={1.5}
            />
            <div>
              <h3 className="text-sm font-medium text-foreground">
                {canRun ? "Application preview" : "Preview unavailable"}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                {canRun
                  ? "Start the dev server to preview and interact with the app."
                  : "No active sandbox or deployment yet. Preview becomes available once the workspace sandbox starts."}
              </p>
            </div>

            {canRun ? (
              <Button
                onClick={() => void devServer.handlePrimaryAction()}
                size="sm"
                className="h-8 gap-1.5 text-xs cursor-pointer"
              >
                <Play className="h-3.5 w-3.5 fill-current" strokeWidth={1.5} />
                Start dev server
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
