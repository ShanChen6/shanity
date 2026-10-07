"use client";

import { useEffect, useState } from "react";

const COLORS = [
  "var(--success)",
  "var(--primary)",
  "var(--warning)",
  "var(--info)",
  "var(--danger)",
];

// Deterministic spread (no Math.random) so renders are stable and testable.
const pieces = Array.from({ length: 48 }, (_, i) => ({
  left: (i * 37) % 100,
  dx: ((i * 53) % 120) - 60,
  rot: 360 + ((i * 71) % 540),
  dur: 2.6 + ((i * 13) % 18) / 10,
  delay: ((i * 7) % 12) / 10,
  color: COLORS[i % COLORS.length]!,
}));

/**
 * One-shot confetti burst for the payment-success screen. Purely decorative
 * (aria-hidden, no pointer events), removed after the animation, and hidden
 * entirely for users who prefer reduced motion.
 */
export function Confetti({ durationMs = 6000 }: { durationMs?: number }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), durationMs);
    return () => clearTimeout(timer);
  }, [durationMs]);
  if (!visible) return null;
  return (
    <div
      data-testid="confetti"
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-40 overflow-hidden"
    >
      {pieces.map((piece, index) => (
        <span
          key={index}
          className="confetti-piece"
          style={
            {
              left: `${piece.left}%`,
              backgroundColor: piece.color,
              "--confetti-dx": `${piece.dx}vw`,
              "--confetti-rot": `${piece.rot}deg`,
              "--confetti-dur": `${piece.dur}s`,
              "--confetti-delay": `${piece.delay}s`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
