import type { Metadata } from "next";
import { Suspense } from "react";
import { SessionsIndexShell } from "./sessions-index-shell";

export const metadata: Metadata = {
  title: "Chats",
  description: "View and manage your chats.",
};

export default function SessionsPage() {
  return (
    <Suspense>
      <SessionsIndexShell />
    </Suspense>
  );
}
