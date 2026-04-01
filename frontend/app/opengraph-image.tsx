import { ImageResponse } from "next/og";

import { SITE_NAME, SITE_TITLE } from "@/lib/seo";

export const runtime = "edge";
export const alt = `${SITE_NAME} stock research preview`;
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          background:
            "linear-gradient(135deg, #0b1020 0%, #111827 45%, #1f2937 100%)",
          color: "#f9fafb",
          padding: "56px",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: "100%",
            height: "100%",
            border: "1px solid rgba(245, 158, 11, 0.28)",
            borderRadius: "32px",
            padding: "44px",
            background: "rgba(15, 23, 42, 0.68)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "16px",
            }}
          >
            <div
              style={{
                width: "64px",
                height: "64px",
                borderRadius: "18px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "linear-gradient(135deg, #f59e0b 0%, #f97316 100%)",
                fontSize: "32px",
                fontWeight: 700,
              }}
            >
              MS
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "6px",
              }}
            >
              <div style={{ fontSize: "22px", color: "#fbbf24", fontWeight: 700 }}>
                {SITE_NAME}
              </div>
              <div style={{ fontSize: "16px", color: "#cbd5e1" }}>
                AI stock analysis for India
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "20px",
              maxWidth: "860px",
            }}
          >
            <div
              style={{
                fontSize: "58px",
                fontWeight: 800,
                lineHeight: 1.05,
                letterSpacing: "-0.03em",
              }}
            >
              {SITE_TITLE}
            </div>
            <div
              style={{
                fontSize: "26px",
                color: "#cbd5e1",
                lineHeight: 1.4,
              }}
            >
              Smart Scores, stock screener tools, IPO tracking, portfolio analysis,
              risk views, and live NSE and BSE market research.
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: "14px",
              flexWrap: "wrap",
            }}
          >
            {["NSE", "BSE", "Smart Score", "IPO Calendar", "Stock Screener"].map((label) => (
              <div
                key={label}
                style={{
                  borderRadius: "999px",
                  border: "1px solid rgba(251, 191, 36, 0.32)",
                  padding: "10px 18px",
                  fontSize: "18px",
                  color: "#fef3c7",
                  background: "rgba(245, 158, 11, 0.08)",
                }}
              >
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    size
  );
}
