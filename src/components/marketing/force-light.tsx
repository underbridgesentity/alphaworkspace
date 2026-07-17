"use client";

/**
 * Marketing surfaces are always light, the brand look. The theme picker
 * lives behind sign-in, so client-side arrivals from a dark app session
 * must shed the dark attribute here.
 */
import { useEffect } from "react";

export function ForceLight() {
  useEffect(() => {
    delete document.documentElement.dataset.theme;
  }, []);
  return null;
}
