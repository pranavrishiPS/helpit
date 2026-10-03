import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #5B3BF0, #FF6B4A)",
          color: "#FFFFFF",
          fontSize: 18,
          fontWeight: 700,
          borderRadius: 8,
        }}
      >
        H
      </div>
    ),
    { ...size }
  );
}
