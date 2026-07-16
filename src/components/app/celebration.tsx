"use client";

import { useEffect } from "react";

/**
 * The signature completion moment: a brief burst of brand-coloured particles
 * from the point of completion. Functional and short (≈700ms), skipped
 * entirely under prefers-reduced-motion.
 */
const COLORS = ["#E85D2B", "#F2A374", "#6FAE87", "#D9A13B", "#F4F2ED"];

function burst(x: number, y: number) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const root = document.createElement("div");
  root.style.cssText = `position:fixed;left:0;top:0;pointer-events:none;z-index:80;`;
  document.body.appendChild(root);

  const count = 14;
  for (let i = 0; i < count; i++) {
    const p = document.createElement("span");
    const size = 4 + Math.random() * 5;
    const color = COLORS[i % COLORS.length];
    const round = Math.random() > 0.4;
    p.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${size}px;height:${size}px;background:${color};border-radius:${round ? "50%" : "2px"};`;
    root.appendChild(p);

    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.6;
    const dist = 36 + Math.random() * 54;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist - 24;

    p.animate(
      [
        { transform: "translate(0,0) scale(1)", opacity: 1 },
        {
          transform: `translate(${dx}px,${dy + 30}px) scale(${0.2 + Math.random() * 0.3}) rotate(${Math.random() * 240 - 120}deg)`,
          opacity: 0,
        },
      ],
      {
        duration: 550 + Math.random() * 250,
        easing: "cubic-bezier(0.16, 0.9, 0.35, 1)",
        fill: "forwards",
      },
    );
  }

  // A soft ring pulse under the particles.
  const ring = document.createElement("span");
  ring.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:8px;height:8px;margin:-4px;border:2px solid #E85D2B;border-radius:50%;`;
  root.appendChild(ring);
  ring.animate(
    [
      { transform: "scale(1)", opacity: 0.8 },
      { transform: "scale(7)", opacity: 0 },
    ],
    { duration: 480, easing: "ease-out", fill: "forwards" },
  );

  window.setTimeout(() => root.remove(), 900);
}

export function Celebration() {
  useEffect(() => {
    const onCelebrate = (e: Event) => {
      const { x, y } = (e as CustomEvent<{ x: number; y: number }>).detail;
      burst(x, y);
    };
    window.addEventListener("aw:celebrate", onCelebrate);
    return () => window.removeEventListener("aw:celebrate", onCelebrate);
  }, []);
  return null;
}
