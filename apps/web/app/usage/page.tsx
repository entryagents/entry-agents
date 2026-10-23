import type { Metadata } from "next";
import { UsageClient } from "./usage-client";

export const metadata: Metadata = {
  title: "Usage & Balance",
  description:
    "Real-time Entry account credit balance, rolling usage windows, and agent compute telemetry.",
  alternates: {
    canonical: "/usage",
  },
  openGraph: {
    url: "/usage",
    title: "Usage & Balance — Entry Agents",
  },
};

export const dynamic = "force-dynamic";

export default function UsagePage() {
  return <UsageClient />;
}
