import { ImageResponse } from "next/og";

/** Square app icon. Maskable icons keep the glyph inside the central safe zone. */
export function pwaIcon(size: number, maskable = false): ImageResponse {
  const glyph = Math.round(size * (maskable ? 0.42 : 0.56));
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          // ImageResponse can't read CSS vars — literal values mirror --signal / --foreground.
          background: "#E8590C",
          color: "#1A1918",
          fontSize: glyph,
          fontWeight: 700,
          borderRadius: maskable ? 0 : Math.round(size * 0.22),
        }}
      >
        H
      </div>
    ),
    { width: size, height: size }
  );
}
