import type { Metadata } from "next";
import { Suspense } from "react";
import { SessionsIndexShell } from "../sessions/sessions-index-shell";

export const metadata: Metadata = {
  title: "Chats",
  description: "View and manage your chats.",
};

export default function ChatsPage() {
  return (
    <Suspense>
      <SessionsIndexShell />
    </Suspense>
  );
}
