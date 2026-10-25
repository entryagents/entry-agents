"use client";

import {
  ExternalLink,
  Globe,
  Loader2,
  Monitor,
  Play,
  RotateCcw,
  Smartphone,
  Square,
  Tablet,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
import type { DevServerControls } from "../hooks/use-dev-server";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

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
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const isDevServerReady = devServer.state.status === "ready";
  const isDevServerStarting = devServer.state.status === "starting";
  const devServerUrl =
    devServer.state.status === "ready" ? devServer.state.info.url : null;

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

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Browser Bar */}
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted/40 px-3 py-1.5 gap-2">
        {/* Left: Navigation & Reload */}
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={handleReload}
                disabled={!currentPreviewUrl}
                aria-label="Reload preview"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Reload preview</TooltipContent>
          </Tooltip>

          {/* Dev server source toggle vs Vercel preview (if linked) */}
          {previewDeploymentTargetUrl && (
            <div className="flex items-center rounded-md border border-border p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setActiveSource("dev-server")}
                className={cn(
                  "rounded px-2 py-0.5 font-medium transition-colors",
                  activeSource === "dev-server"
                    ? "bg-secondary text-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Dev Server
              </button>
              <button
                type="button"
                onClick={() => setActiveSource("vercel")}
                className={cn(
                  "rounded px-2 py-0.5 font-medium transition-colors",
                  activeSource === "vercel"
                    ? "bg-secondary text-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Vercel
              </button>
            </div>
          )}
        </div>

        {/* Center: Address Bar Display */}
        <div className="flex flex-1 max-w-md items-center rounded-md border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground font-mono truncate">
          <Globe className="mr-1.5 h-3.5 w-3.5 shrink-0 opacity-60" />
          <span className="truncate">
            {currentPreviewUrl || "http://localhost:3000"}
          </span>
          {isDevServerReady && (
            <span className="ml-auto flex items-center gap-1 pl-2 text-[10px] text-emerald-500 font-semibold shrink-0">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live
            </span>
          )}
        </div>

        {/* Right: Viewport mode switcher & External open */}
        <div className="flex items-center gap-1">
          {/* Viewport switchers */}
          <div className="hidden sm:flex items-center rounded-md border border-border p-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setViewport("desktop")}
                  className={cn(
                    "rounded p-1 transition-colors",
                    viewport === "desktop"
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  aria-label="Desktop view"
                >
                  <Monitor className="h-3.5 w-3.5" />
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
                    "rounded p-1 transition-colors",
                    viewport === "tablet"
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  aria-label="Tablet view (768px)"
                >
                  <Tablet className="h-3.5 w-3.5" />
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
                    "rounded p-1 transition-colors",
                    viewport === "mobile"
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  aria-label="Mobile view (375px)"
                >
                  <Smartphone className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Mobile (375px)</TooltipContent>
            </Tooltip>
          </div>

          {/* Dev Server Start / Stop */}
          {canRun && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    if (isDevServerReady) {
                      void devServer.handleStopAction();
                    } else {
                      void devServer.handlePrimaryAction();
                    }
                  }}
                  disabled={isDevServerStarting}
                >
                  {isDevServerStarting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />
                  ) : isDevServerReady ? (
                    <Square className="h-3 w-3 fill-current text-red-500" />
                  ) : (
                    <Play className="h-3.5 w-3.5 fill-current text-emerald-500" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {isDevServerStarting
                  ? "Starting dev server..."
                  : isDevServerReady
                    ? "Stop dev server"
                    : "Start dev server"}
              </TooltipContent>
            </Tooltip>
          )}

          {/* Open External */}
          {currentPreviewUrl && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={openInNewTab}
                  aria-label="Open preview in new tab"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Open in new tab</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Main Preview Container */}
      <div className="relative flex flex-1 items-center justify-center overflow-auto bg-muted/20 p-2 sm:p-4">
        {currentPreviewUrl ? (
          <div
            className={cn(
              "h-full overflow-hidden rounded-lg border border-border bg-background shadow-md transition-all duration-300",
              viewport === "desktop" && "w-full",
              viewport === "tablet" && "w-[768px] max-w-full",
              viewport === "mobile" && "w-[375px] max-w-full",
            )}
          >
            <iframe
              key={iframeKey}
              ref={iframeRef}
              src={currentPreviewUrl}
              title="Application Live Preview"
              className="h-full w-full border-0 bg-background"
              sandbox="allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts"
            />
          </div>
        ) : isDevServerStarting ? (
          <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
            <div className="rounded-full bg-amber-500/10 p-4 text-amber-500">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
            <div>
              <p className="font-semibold text-sm text-foreground">
                Starting Development Server...
              </p>
              <p className="mt-1 text-xs text-muted-foreground max-w-sm">
                Booting project framework inside the sandbox environment. This usually takes just a few seconds.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-4 p-8 text-center max-w-md rounded-xl border border-dashed border-border bg-card">
            <div className="rounded-full bg-primary/10 p-4 text-primary">
              <Globe className="h-8 w-8" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-foreground">
                Application Preview Idle
              </h3>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                Start the development server to preview and interact with the application live inside your workspace.
              </p>
            </div>

            {canRun && (
              <Button
                onClick={() => void devServer.handlePrimaryAction()}
                className="gap-2 text-xs h-8"
              >
                <Play className="h-3.5 w-3.5 fill-current" />
                Start Development Server
              </Button>
            )}

            {previewDeploymentTargetUrl && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveSource("vercel")}
                className="gap-1.5 text-xs h-8"
              >
                <Globe className="h-3.5 w-3.5 text-blue-500" />
                View Vercel Deployment
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
