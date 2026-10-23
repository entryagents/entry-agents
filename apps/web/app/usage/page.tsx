import { redirect } from "next/navigation";

/**
 * Usage is private account telemetry and is merged with the user's
 * Profile & Settings page. Redirect all visits to /settings/profile.
 */
export default function UsagePage() {
  redirect("/settings/profile");
}
