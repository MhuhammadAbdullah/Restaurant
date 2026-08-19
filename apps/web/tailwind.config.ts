import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          bg: "#0d0d0d",
          surface: "#161616",
          red: "#ED2320",
          "red-dark": "#b91a16",
          cream: "#f7f3ee",
        },
        page: "var(--color-page)",
        surface: "var(--color-surface)",
        "surface-alt": "var(--color-surface-alt)",
        ink: "var(--color-ink)",
        muted: "var(--color-muted)",
        line: "var(--color-line)",
      },
      borderColor: {
        DEFAULT: "var(--color-line)",
      },
      fontFamily: {
        display: ["var(--font-display)", "cursive"],
        sans: ["var(--font-sans)", "sans-serif"],
      },
      keyframes: {
        shimmer: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
        "pop-in": {
          "0%": { transform: "scale(0)", opacity: "0" },
          "60%": { transform: "scale(1.15)", opacity: "1" },
          "100%": { transform: "scale(1)" },
        },
        steam: {
          "0%": { transform: "translateY(0) scaleX(1)", opacity: "0" },
          "30%": { opacity: "0.7" },
          "100%": { transform: "translateY(-14px) scaleX(1.4)", opacity: "0" },
        },
        "pot-jiggle": {
          "0%, 100%": { transform: "rotate(-2deg)" },
          "50%": { transform: "rotate(2deg)" },
        },
        ride: {
          "0%, 100%": { transform: "translateX(0)" },
          "50%": { transform: "translateX(6px)" },
        },
        "wheel-spin": {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        "packet-bounce": {
          "0%, 100%": { transform: "translateY(0) rotate(-3deg)" },
          "50%": { transform: "translateY(-6px) rotate(3deg)" },
        },
        sparkle: {
          "0%, 100%": { opacity: "0", transform: "scale(0.5)" },
          "50%": { opacity: "1", transform: "scale(1)" },
        },
        "logo-zoom": {
          "0%, 100%": { transform: "scale(0.92)" },
          "50%": { transform: "scale(1.04)" },
        },
        "dots-blink": {
          "0%, 100%": { opacity: "0.2" },
          "20%": { opacity: "1" },
        },
      },
      animation: {
        shimmer: "shimmer 1.6s ease-in-out infinite",
        "pop-in": "pop-in 0.5s cubic-bezier(0.34,1.56,0.64,1) both",
        steam: "steam 1.8s ease-out infinite",
        "pot-jiggle": "pot-jiggle 0.6s ease-in-out infinite",
        ride: "ride 1s ease-in-out infinite",
        "wheel-spin": "wheel-spin 0.7s linear infinite",
        "packet-bounce": "packet-bounce 1s ease-in-out infinite",
        sparkle: "sparkle 1.4s ease-in-out infinite",
        "logo-zoom": "logo-zoom 2.2s ease-in-out infinite",
        "dots-blink": "dots-blink 1.4s infinite both",
      },
    },
  },
  plugins: [],
};

export default config;
