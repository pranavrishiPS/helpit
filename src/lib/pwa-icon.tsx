import { ImageResponse } from "next/og";

// ImageResponse can't read CSS vars — literal values mirror --sidebar (ink), --background (paper), --signal.
const INK = "#1A1918";
const PAPER = "#F6F4EF";
const SIGNAL = "#E8590C";

/** Bump when the icon artwork changes so installed PWAs fetch the new files. */
export const ICON_VERSION = "2";

/**
 * The "full stop" mark (lowercase h + orange square) on an ink tile.
 * `scale` is the glyph's share of the 100-unit tile; smaller sizes get heavier strokes.
 */
export function brandTile(size: number, { scale, radius }: { scale: number; radius: number }) {
  const heavy = size <= 48;
  const stroke = heavy ? 17 : 14;
  const dot = heavy ? { x: 78, y: 70, s: 18 } : { x: 80, y: 74, s: 14 };
  // Glyph spans x 21–94, y 12–88 in its own 100-unit box; centre it optically.
  const tx = 50 - 56 * scale;
  const ty = 50 - 50 * scale;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: INK, borderRadius: radius }}>
        <svg width={size} height={size} viewBox="0 0 100 100">
          <g transform={`translate(${tx} ${ty}) scale(${scale})`}>
            <path
              d="M28 12V88M28 56C28 42 37 34 49 34C61 34 70 42 70 56V88"
              stroke={PAPER}
              strokeWidth={stroke}
              fill="none"
            />
            <rect x={dot.x} y={dot.y} width={dot.s} height={dot.s} fill={SIGNAL} />
          </g>
        </svg>
      </div>
    ),
    {
      width: size,
      height: size,
      // ImageResponse defaults to a 1-year immutable cache, which pins old icons on installed PWAs.
      headers: { "Cache-Control": "public, max-age=86400, must-revalidate" },
    }
  );
}

/** Square app icon. Maskable icons keep the glyph inside the central safe zone. */
export function pwaIcon(size: number, maskable = false): ImageResponse {
  return brandTile(size, {
    scale: maskable ? 0.5 : 0.64,
    radius: maskable ? 0 : Math.round(size * 0.22),
  });
}
