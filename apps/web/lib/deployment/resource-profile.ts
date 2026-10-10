export type EntryAgentsResourceProfile = "standard" | "hobby";

export function getEntryAgentsResourceProfile(): EntryAgentsResourceProfile {
  return process.env.OPEN_AGENTS_RESOURCE_PROFILE === "hobby"
    ? "hobby"
    : "standard";
}

export function isHobbyResourceProfile(): boolean {
  return getEntryAgentsResourceProfile() === "hobby";
}
