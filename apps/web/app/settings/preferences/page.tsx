import type { Metadata } from "next";
import { PreferencesSection } from "../preferences-section";

export const metadata: Metadata = {
  title: "Preferences",
  description: "Adjust Entry Agent preferences and behavior.",
};

export default function PreferencesPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Preferences
        </h1>
        <p className="text-sm text-muted-foreground">
          Control workspace defaults, tool approvals, and notifications
        </p>
      </div>
      <PreferencesSection />
    </div>
  );
}
