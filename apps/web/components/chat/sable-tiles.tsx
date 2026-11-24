"use client";

import type { CSSProperties } from "react";

/**
 * Ported 1:1 from Leonxlnx/sable `src/art/Logo.tsx` (`Tiles`).
 * 4x4 ordered-dither working indicator: cells light one after another in Bayer order,
 * monochrome, calm, and lightweight.
 */
const MARK_CELLS: readonly (readonly [number, number])[] = [
  [0, 0],
  [2, 2],
  [2, 0],
  [0, 2],
  [1, 1],
  [3, 3],
  [3, 1],
  [1, 3],
  [1, 0],
  [3, 0],
  [1, 2],
  [0, 1],
  [2, 1],
  [0, 3],
];

const TILE_ORDER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
] as const;

export function SableTiles({
  size = 12,
  active = true,
  className,
}: {
  size?: number;
  active?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`sable-tiles ${active ? "sable-tiles-active" : ""} ${className ?? ""}`}
      style={{ "--s": `${size}px` } as CSSProperties}
      aria-hidden="true"
    >
      {MARK_CELLS.map(([c, r], i) => (
        <i
          key={`${c}-${r}-${i}`}
          style={
            {
              gridColumn: c + 1,
              gridRow: r + 1,
              "--d": TILE_ORDER[r][c],
            } as CSSProperties
          }
        />
      ))}
    </span>
  );
}
