"use client";

import { useMemo } from "react";

type Dimension = {
  label: string;
  value: number;
  maxValue: number;
};

const COLORS = {
  fill: "rgba(139, 92, 246, 0.15)",
  stroke: "rgba(139, 92, 246, 0.8)",
  grid: "rgba(130, 148, 179, 0.15)",
  gridDark: "rgba(130, 148, 179, 0.08)",
  text: "currentColor",
};

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

export function SnowflakeChart({
  dimensions,
  size = 220,
}: {
  dimensions: Dimension[];
  size?: number;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size * 0.38;
  const levels = 5;

  const points = useMemo(() => {
    const n = dimensions.length;
    const angleStep = 360 / n;
    return dimensions.map((dim, i) => {
      const angle = angleStep * i;
      const normalizedValue = Math.max(0, Math.min(1, dim.value / dim.maxValue));
      const r = normalizedValue * maxR;
      const pos = polarToCartesian(cx, cy, r, angle);
      const labelPos = polarToCartesian(cx, cy, maxR + 18, angle);
      const axisEnd = polarToCartesian(cx, cy, maxR, angle);
      return { ...dim, angle, normalizedValue, pos, labelPos, axisEnd };
    });
  }, [dimensions, cx, cy, maxR]);

  const polygonPath = points.map((p) => `${p.pos.x},${p.pos.y}`).join(" ");

  const gridPolygons = useMemo(() => {
    const n = dimensions.length;
    const angleStep = 360 / n;
    return Array.from({ length: levels }, (_, level) => {
      const r = ((level + 1) / levels) * maxR;
      const pts = Array.from({ length: n }, (_, i) => {
        const p = polarToCartesian(cx, cy, r, angleStep * i);
        return `${p.x},${p.y}`;
      }).join(" ");
      return pts;
    });
  }, [dimensions.length, cx, cy, maxR, levels]);

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[260px]">
      {/* Grid levels */}
      {gridPolygons.map((pts, i) => (
        <polygon
          key={i}
          points={pts}
          fill="none"
          stroke={i === levels - 1 ? COLORS.grid : COLORS.gridDark}
          strokeWidth={i === levels - 1 ? 1 : 0.5}
        />
      ))}

      {/* Axis lines */}
      {points.map((p, i) => (
        <line
          key={`axis-${i}`}
          x1={cx}
          y1={cy}
          x2={p.axisEnd.x}
          y2={p.axisEnd.y}
          stroke={COLORS.gridDark}
          strokeWidth="0.5"
        />
      ))}

      {/* Value polygon */}
      <polygon
        points={polygonPath}
        fill={COLORS.fill}
        stroke={COLORS.stroke}
        strokeWidth="2"
        strokeLinejoin="round"
      />

      {/* Data points */}
      {points.map((p, i) => (
        <circle
          key={`dot-${i}`}
          cx={p.pos.x}
          cy={p.pos.y}
          r="3.5"
          fill={COLORS.stroke}
          stroke="white"
          strokeWidth="1.5"
        />
      ))}

      {/* Labels */}
      {points.map((p, i) => (
        <text
          key={`label-${i}`}
          x={p.labelPos.x}
          y={p.labelPos.y}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="8"
          fill={COLORS.text}
          opacity="0.6"
          fontWeight="500"
        >
          {p.label}
        </text>
      ))}
    </svg>
  );
}
