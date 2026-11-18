import type { Metadata } from "next";
import { Suspense } from "react";
import { SessionsIndexShell } from "./sessions-index-shell";

export const metadata: Metadata = {
  title: "Sessions",
  description: "View and manage your sessions.",
};

export default function SessionsPage() {
  return (
    <Suspense>
      <SessionsIndexShell />
    </Suspense>
  );
}
