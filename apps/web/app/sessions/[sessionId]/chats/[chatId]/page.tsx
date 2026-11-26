import { redirect } from "next/navigation";

interface LegacySessionChatPageProps {
  params: Promise<{ sessionId: string; chatId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LegacySessionChatPage({
  params,
  searchParams,
}: LegacySessionChatPageProps) {
  const [{ chatId }, query] = await Promise.all([params, searchParams]);
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (typeof v === "string") qs.set(k, v);
    else if (Array.isArray(v)) {
      for (const item of v) qs.append(k, item);
    }
  }
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  redirect(`/chats/${chatId}${suffix}`);
}
