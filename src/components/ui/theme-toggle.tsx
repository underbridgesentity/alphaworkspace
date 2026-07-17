"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/cn";
import { MenuItem } from "./menu";

/** Dark-first: dark is the default; the toggle persists an explicit choice. */
function applyTheme(light: boolean) {
  if (light) {
    document.documentElement.dataset.theme = "light";
    localStorage.setItem("aw-theme", "light");
  } else {
    delete document.documentElement.dataset.theme;
    localStorage.setItem("aw-theme", "dark");
  }
}

function useThemeState() {
  const [light, setLight] = useState(false);
  useEffect(() => {
    // Deferred a tick: reading external DOM state, then setting.
    const id = window.setTimeout(
      () => setLight(document.documentElement.dataset.theme === "light"),
      0,
    );
    return () => window.clearTimeout(id);
  }, []);
  const toggle = () => {
    const next = !light;
    setLight(next);
    applyTheme(next);
  };
  return { light, toggle };
}

/** Menu-row variant (avatar menu). */
export function ThemeToggleItem() {
  const { light, toggle } = useThemeState();
  return (
    <MenuItem onClick={toggle}>
      {light ? <Moon className="size-4" /> : <Sun className="size-4" />}
      {light ? "Dark mode" : "Light mode"}
    </MenuItem>
  );
}

/** Standalone icon button (headers). */
export function ThemeToggleButton({ className }: { className?: string }) {
  const { light, toggle } = useThemeState();
  return (
    <button
      onClick={toggle}
      aria-label={light ? "Switch to dark mode" : "Switch to light mode"}
      title={light ? "Dark mode" : "Light mode"}
      className={cn(
        "press flex size-10 items-center justify-center rounded-control text-muted hover:bg-raised hover:text-ink",
        className,
      )}
    >
      {light ? <Moon className="size-[1.15rem]" /> : <Sun className="size-[1.15rem]" />}
    </button>
  );
}
