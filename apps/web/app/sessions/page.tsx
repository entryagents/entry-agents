import { redirect } from "next/navigation";

interface LegacySessionsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LegacySessionsPage({
  searchParams,
}: LegacySessionsPageProps) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === "string") qs.set(k, v);
    else if (Array.isArray(v)) {
      for (const item of v) qs.append(k, item);
    }
  }
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  redirect(`/chats${suffix}`);
}
