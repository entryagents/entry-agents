"use client";

import { X } from "lucide-react";
import type { ImageAttachment } from "@/lib/image-utils";
import { cn } from "@/lib/utils";

interface ImageAttachmentItemProps {
  image: ImageAttachment;
  onRemove: () => void;
}

function ImageAttachmentItem({ image, onRemove }: ImageAttachmentItemProps) {
  return (
    <div className="group relative size-[52px] shrink-0">
      {/* eslint-disable-next-line @next/next/no-img-element -- Data URLs not supported by next/image */}
      <img
        src={image.dataUrl}
        alt={image.filename ?? "Attached image"}
        className="size-full rounded-[10px] object-cover ring-1 ring-border/70"
        draggable={false}
      />
      <button
        type="button"
        onClick={onRemove}
        className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-foreground/85 text-background opacity-0 transition-opacity hover:bg-foreground focus-visible:opacity-100 group-hover:opacity-100"
        aria-label="Remove image"
      >
        <X className="size-2.5" strokeWidth={2} />
      </button>
    </div>
  );
}

interface ImageAttachmentsPreviewProps {
  images: ImageAttachment[];
  onRemove: (id: string) => void;
  className?: string;
}

export function ImageAttachmentsPreview({
  images,
  onRemove,
  className,
}: ImageAttachmentsPreviewProps) {
  if (images.length === 0) return null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1.5 px-2.5 pb-2 pt-1.5",
        className,
      )}
    >
      {images.map((image) => (
        <ImageAttachmentItem
          key={image.id}
          image={image}
          onRemove={() => onRemove(image.id)}
        />
      ))}
    </div>
  );
}
