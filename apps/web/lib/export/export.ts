import { toast } from "sonner";
import { markdownFilename } from "./chat-markdown";

export interface ExportPayload {
  title: string;
  markdown: string;
}

/**
 * Copy the active chat's Markdown transcript to the system clipboard.
 */
export async function copyChatMarkdown(
  getPayload: () => ExportPayload | null,
): Promise<void> {
  const payload = getPayload();
  if (!payload) {
    toast.error("Chat is still loading");
    return;
  }

  try {
    await navigator.clipboard.writeText(payload.markdown);
    toast.success("Copied the chat as Markdown");
  } catch (err) {
    const message =
      err instanceof Error &&
      /clipboard|denied|document is not focused/i.test(err.message)
        ? "Could not reach the clipboard"
        : err instanceof Error
          ? err.message
          : "Could not copy chat";
    toast.error(message);
  }
}

/**
 * Download the active chat's Markdown transcript as a `.md` file.
 */
export function exportChatMarkdown(
  getPayload: () => ExportPayload | null,
): void {
  const payload = getPayload();
  if (!payload) {
    toast.error("Chat is still loading");
    return;
  }

  const fileName = markdownFilename(payload.title);
  const url = URL.createObjectURL(
    new Blob([payload.markdown], { type: "text/markdown;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  toast.success(`Downloaded ${fileName}`);
}
