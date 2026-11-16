"use client";

import Image from "next/image";
import { Plug } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function ToolkitPresetIcon({
  slug,
  className = "size-5",
}: {
  readonly slug: string;
  readonly className?: string;
}) {
  switch (slug.toLowerCase()) {
    case "gmail":
      return (
        <svg
          viewBox="0 0 24 24"
          className={className}
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M20 4H4C2.9 4 2 4.9 2 6V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V6C22 4.9 21.1 4 20 4Z"
            stroke="#EA4335"
            strokeWidth="1.75"
          />
          <path
            d="M3 6.5L12 13L21 6.5"
            stroke="#EA4335"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "slack":
      return (
        <svg
          viewBox="0 0 24 24"
          className={className}
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M14.5 10C13.67 10 13 9.33 13 8.5V3.5C13 2.67 13.67 2 14.5 2C15.33 2 16 2.67 16 3.5V8.5C16 9.33 15.33 10 14.5 10Z"
            fill="#2EB67D"
          />
          <path
            d="M9.5 14C10.33 14 11 14.67 11 15.5V20.5C11 21.33 10.33 22 9.5 22C8.67 22 8 21.33 8 20.5V15.5C8 14.67 8.67 14 9.5 14Z"
            fill="#E01E5A"
          />
          <path
            d="M10 9.5C10 10.33 9.33 11 8.5 11H3.5C2.67 11 2 10.33 2 9.5C2 8.67 2.67 8 3.5 8H8.5C9.33 8 10 8.67 10 9.5Z"
            fill="#36C5F0"
          />
          <path
            d="M14 14.5C14 13.67 14.67 13 15.5 13H20.5C21.33 13 22 13.67 22 14.5C22 15.33 21.33 16 20.5 16H15.5C14.67 16 14 15.33 14 14.5Z"
            fill="#ECB22E"
          />
        </svg>
      );
    case "notion":
      return (
        <svg
          viewBox="0 0 24 24"
          className={className}
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M4.5 3.5L16.5 2.5L20.5 5.5V20L7.5 21L3.5 18V4.5L4.5 3.5ZM8.5 8.5V17H10.3V11.8L14.2 17H16V8.5H14.2V13.6L10.4 8.5H8.5Z" />
        </svg>
      );
    case "linear":
      return (
        <svg
          viewBox="0 0 24 24"
          className={className}
          fill="none"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" stroke="#5E6AD2" strokeWidth="1.8" />
          <path
            d="M5.5 14.5L9.5 18.5M4.8 11L13 19.2M7 7L17 17"
            stroke="#5E6AD2"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </svg>
      );
    case "googlecalendar":
      return (
        <svg
          viewBox="0 0 24 24"
          className={className}
          fill="none"
          aria-hidden="true"
        >
          <rect
            x="3"
            y="4"
            width="18"
            height="17"
            rx="2.5"
            stroke="#4285F4"
            strokeWidth="1.75"
          />
          <path d="M3 9H21" stroke="#4285F4" strokeWidth="1.75" />
          <path
            d="M8 2.5V5.5M16 2.5V5.5"
            stroke="#34A853"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
          <rect x="8" y="12" width="3.5" height="3.5" rx="0.7" fill="#EA4335" />
          <rect
            x="12.5"
            y="12"
            width="3.5"
            height="3.5"
            rx="0.7"
            fill="#FBBC04"
          />
        </svg>
      );
    case "googledrive":
      return (
        <svg
          viewBox="0 0 24 24"
          className={className}
          fill="none"
          aria-hidden="true"
        >
          <path d="M9 4L3 14.5L6 19.5L12 9L9 4Z" fill="#0F9D58" />
          <path d="M9 4H15L21 14.5H15L9 4Z" fill="#FFC107" />
          <path d="M6 19.5L9 14.5H21L18 19.5H6Z" fill="#4285F4" />
        </svg>
      );
    case "github":
      return (
        <svg
          viewBox="0 0 24 24"
          className={className}
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M12 1.5C6.2 1.5 1.5 6.2 1.5 12C1.5 16.64 4.51 20.57 8.68 21.96C9.2 22.05 9.39 21.74 9.39 21.46V19.5C6.47 20.14 5.85 18.26 5.85 18.26C5.37 17.05 4.68 16.72 4.68 16.72C3.73 16.07 4.75 16.08 4.75 16.08C5.8 16.16 6.36 17.16 6.36 17.16C7.29 18.77 8.81 18.3 9.41 18.03C9.5 17.35 9.78 16.89 10.08 16.62C7.75 16.36 5.3 15.46 5.3 11.43C5.3 10.28 5.71 9.34 6.38 8.6C6.27 8.34 5.91 7.27 6.48 5.82C6.48 5.82 7.36 5.54 9.37 6.9C10.21 6.67 11.11 6.55 12 6.55C12.89 6.55 13.79 6.67 14.63 6.9C16.64 5.54 17.52 5.82 17.52 5.82C18.09 7.27 17.73 8.34 17.62 8.6C18.29 9.34 18.7 10.28 18.7 11.43C18.7 15.47 16.24 16.36 13.9 16.61C14.28 16.94 14.61 17.58 14.61 18.57V21.46C14.61 21.74 14.8 22.06 15.33 21.96C19.49 20.57 22.5 16.64 22.5 12C22.5 6.2 17.8 1.5 12 1.5Z" />
        </svg>
      );
    case "vercel":
      return (
        <svg
          viewBox="0 0 24 24"
          className={className}
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M12 4L21.5 20H2.5L12 4Z" />
        </svg>
      );
    case "jira":
      return (
        <svg
          viewBox="0 0 24 24"
          className={className}
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M11.6 3L4 10.6L8.2 14.8L11.6 11.4L15.8 15.6L20 11.4L11.6 3Z"
            fill="#2684FF"
          />
          <path
            d="M11.6 11.4L7.4 15.6L11.6 19.8L15.8 15.6L11.6 11.4Z"
            fill="#0052CC"
          />
        </svg>
      );
    case "figma":
      return (
        <svg
          viewBox="0 0 24 24"
          className={className}
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M8.5 2H12V9H8.5C6.57 9 5 7.43 5 5.5C5 3.57 6.57 2 8.5 2Z"
            fill="#F24E1E"
          />
          <path
            d="M12 2H15.5C17.43 2 19 3.57 19 5.5C19 7.43 17.43 9 15.5 9H12V2Z"
            fill="#FF7262"
          />
          <path
            d="M12 12.5C12 10.57 13.57 9 15.5 9C17.43 9 19 10.57 19 12.5C19 14.43 17.43 16 15.5 16C13.57 16 12 14.43 12 12.5Z"
            fill="#1ABCFE"
          />
          <path
            d="M5 19.5C5 17.57 6.57 16 8.5 16H12V19.5C12 21.43 10.43 23 8.5 23C6.57 23 5 21.43 5 19.5Z"
            fill="#0ACF83"
          />
          <path
            d="M5 12.5C5 10.57 6.57 9 8.5 9H12V16H8.5C6.57 16 5 14.43 5 12.5Z"
            fill="#A259FF"
          />
        </svg>
      );
    case "discord":
      return (
        <svg
          viewBox="0 0 24 24"
          className={className}
          fill="#5865F2"
          aria-hidden="true"
        >
          <path d="M19.27 5.33C17.94 4.71 16.5 4.26 15 4C14.82 4.33 14.6 4.77 14.45 5.12C12.86 4.88 11.28 4.88 9.71 5.12C9.56 4.77 9.33 4.33 9.15 4C7.64 4.26 6.2 4.71 4.87 5.33C2.16 9.41 1.43 13.38 1.8 17.3C3.6 18.63 5.35 19.44 7.07 19.97C7.5 19.39 7.88 18.77 8.21 18.11C7.59 17.88 7 17.59 6.44 17.26C6.59 17.15 6.73 17.03 6.87 16.91C10.27 18.49 13.97 18.49 17.33 16.91C17.47 17.03 17.61 17.15 17.76 17.26C17.2 17.59 16.6 17.88 15.98 18.11C16.31 18.77 16.69 19.39 17.12 19.97C18.85 19.44 20.6 18.63 22.4 17.3C22.84 12.75 21.66 8.82 19.27 5.33ZM8.68 14.89C7.65 14.89 6.8 13.94 6.8 12.77C6.8 11.6 7.63 10.65 8.68 10.65C9.73 10.65 10.58 11.6 10.56 12.77C10.56 13.94 9.73 14.89 8.68 14.89ZM15.52 14.89C14.49 14.89 13.64 13.94 13.64 12.77C13.64 11.6 14.47 10.65 15.52 10.65C16.57 10.65 17.42 11.6 17.4 12.77C17.4 13.94 16.57 14.89 15.52 14.89Z" />
        </svg>
      );
    case "hubspot":
      return (
        <svg
          viewBox="0 0 24 24"
          className={className}
          fill="none"
          aria-hidden="true"
        >
          <circle
            cx="14.5"
            cy="12"
            r="4.2"
            stroke="#FF7A59"
            strokeWidth="1.8"
          />
          <circle cx="14.5" cy="4.5" r="1.7" fill="#FF7A59" />
          <circle cx="6.2" cy="17.2" r="2.2" fill="#FF7A59" />
          <path
            d="M14.5 6.2V7.8M11 14.4L8 16.2"
            stroke="#FF7A59"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      );
    case "asana":
      return (
        <svg
          viewBox="0 0 24 24"
          className={className}
          fill="#F06A6A"
          aria-hidden="true"
        >
          <circle cx="12" cy="7.5" r="3.6" />
          <circle cx="6.8" cy="16.2" r="3.6" />
          <circle cx="17.2" cy="16.2" r="3.6" />
        </svg>
      );
    case "stripe":
      return (
        <svg
          viewBox="0 0 24 24"
          className={className}
          fill="none"
          aria-hidden="true"
        >
          <rect x="3" y="3" width="18" height="18" rx="4" fill="#635BFF" />
          <path
            d="M11.6 9.9C11.6 9.35 12.06 9.13 12.82 9.13C13.91 9.13 15.27 9.46 16.36 10.05V6.69C15.17 6.22 14 6.03 12.82 6.03C9.93 6.03 8.01 7.54 8.01 10.07C8.01 14.01 13.44 13.38 13.44 15.08C13.44 15.72 12.88 15.93 12.1 15.93C10.94 15.93 9.45 15.46 8.27 14.81V18.22C9.57 18.78 10.9 19.01 12.1 19.01C15.06 19.01 17.1 17.55 17.1 14.98C17.1 10.73 11.6 11.49 11.6 9.9Z"
            fill="#FFFFFF"
          />
        </svg>
      );
    case "supabase":
      return (
        <svg
          viewBox="0 0 24 24"
          className={className}
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M13.5 21C13 21.6 12 21.25 12 20.46V13.5H19.4C20.24 13.5 20.72 14.46 20.2 15.13L13.5 21Z"
            fill="#3ECF8E"
          />
          <path
            d="M10.5 3C11 2.4 12 2.75 12 3.54V10.5H4.6C3.76 10.5 3.28 9.54 3.8 8.87L10.5 3Z"
            fill="#24B47E"
          />
        </svg>
      );
    case "openai":
      return (
        <svg
          viewBox="0 0 24 24"
          className={className}
          fill="none"
          aria-hidden="true"
        >
          <circle
            cx="12"
            cy="12"
            r="8.2"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <circle
            cx="12"
            cy="12"
            r="3"
            stroke="currentColor"
            strokeWidth="1.6"
          />
        </svg>
      );
    case "resend":
      return (
        <svg
          viewBox="0 0 24 24"
          className={className}
          fill="none"
          aria-hidden="true"
        >
          <rect
            x="3.5"
            y="3.5"
            width="17"
            height="17"
            rx="4"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path
            d="M8.5 16V8H12.8C14.4 8 15.4 8.9 15.4 10.3C15.4 11.7 14.4 12.6 12.8 12.6H8.5M12.2 12.6L15.6 16"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "posthog":
      return (
        <svg
          viewBox="0 0 24 24"
          className={className}
          fill="none"
          aria-hidden="true"
        >
          <rect x="4" y="12" width="3.5" height="7" rx="1" fill="#F9BD2B" />
          <rect x="10.25" y="8" width="3.5" height="11" rx="1" fill="#F54E00" />
          <rect
            x="16.5"
            y="4.5"
            width="3.5"
            height="14.5"
            rx="1"
            fill="#1D4AFF"
          />
        </svg>
      );
    case "cloudflare":
      return (
        <svg
          viewBox="0 0 24 24"
          className={className}
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M6.5 17.5H18.2C19.75 17.5 21 16.25 21 14.7C21 13.26 19.91 12.08 18.5 11.92C18.08 9.13 15.68 7 12.78 7C10.17 7 7.98 8.74 7.26 11.12C5.43 11.35 4 12.92 4 14.82C4 16.3 5.12 17.5 6.5 17.5Z"
            fill="#F38020"
          />
        </svg>
      );
    default:
      return (
        <Plug
          className={cn(className, "text-muted-foreground")}
          strokeWidth={1.5}
        />
      );
  }
}

export function ToolkitBrandIcon({
  slug,
  logo,
  className = "size-5",
}: {
  readonly slug: string;
  readonly logo?: string | null;
  readonly className?: string;
}) {
  const [failedLogo, setFailedLogo] = useState<string | null>(null);
  const resolvedLogo =
    logo?.trim() || `https://logos.composio.dev/api/${slug.toLowerCase()}`;

  if (resolvedLogo && failedLogo !== resolvedLogo) {
    return (
      <Image
        key={resolvedLogo}
        src={resolvedLogo}
        alt=""
        width={20}
        height={20}
        unoptimized
        onError={() => setFailedLogo(resolvedLogo)}
        className={cn(className, "rounded-sm object-contain")}
      />
    );
  }

  return <ToolkitPresetIcon slug={slug} className={className} />;
}
