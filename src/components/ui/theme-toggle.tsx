"use client";

import { useState } from "react";
import { Moon, Sun } from "lucide-react";
import { MenuItem } from "./menu";

/** Dark-first: dark is the default; the toggle persists an explicit choice. */
export function ThemeToggleItem() {
  // Only ever mounted inside an opened menu (post-hydration), so reading the
  // DOM in the initializer is safe.
  const [light, setLight] = useState(
    () =>
      typeof document !== "undefined" &&
      document.documentElement.dataset.theme === "light",
  );

  const toggle = () => {
    const next = !light;
    setLight(next);
    if (next) {
      document.documentElement.dataset.theme = "light";
      localStorage.setItem("aw-theme", "light");
    } else {
      delete document.documentElement.dataset.theme;
      localStorage.setItem("aw-theme", "dark");
    }
  };

  return (
    <MenuItem onClick={toggle}>
      {light ? <Moon className="size-4" /> : <Sun className="size-4" />}
      {light ? "Dark mode" : "Light mode"}
    </MenuItem>
  );
}
