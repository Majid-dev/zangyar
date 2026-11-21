import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        primary: "var(--primary)",
        "primary-soft": "var(--primary-soft)",
        secondary: "var(--secondary)",
        accent: "var(--accent)",
        success: "var(--success)",
        danger: "var(--danger)",
        warning: "var(--warning)",
        surface: "var(--surface)",
        paper: "var(--paper)",
        sage: "var(--sage)",
        muted: "var(--muted)",
        border: "var(--border)",
        focus: "var(--focus)",
      },
      fontFamily: { sans: ["var(--font-vazirmatn)", "Tahoma", "sans-serif"] },
    },
  },
  plugins: [],
};

export default config;
