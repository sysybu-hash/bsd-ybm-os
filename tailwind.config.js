/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "var(--font-heebo)",
          "var(--font-assistant)",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
      },
      /* ─── Design Tokens ──────────────────────────────────────────────── */
      colors: {
        /* Brand — סמנטי (מסכי עבודה) + סקאלה לשימוש עתידי */
        brand: {
          DEFAULT: "#7C3AED",
          light: "#A78BFA",
          dark: "#5B21B6",
          surface: "#FFFFFF",
          background: "#F8F9FA",
          50:  "#faf5ff",
          100: "#f3e8ff",
          200: "#e9d5ff",
          300: "#d8b4fe",
          400: "#c084fc",
          500: "#a855f7",
          600: "#9333ea",
          700: "#7e22ce",
          800: "#6b21a8",
          900: "#581c87",
        },
        text: {
          primary: "#1F2937",
          secondary: "#6B7280",
        },
        /* Dark surfaces (landing page / auth pages) */
        dark: {
          900: "#050508",
          800: "#0a0a0f",
          700: "#0f0f16",
          600: "#16161f",
          500: "#1e1e2a",
          border: "rgba(255,255,255,0.07)",
        },
        /* Dashboard surfaces (light work environment) */
        surface: {
          bg:     "#f8f9fb",
          card:   "#ffffff",
          border: "#e8eaf0",
          muted:  "#f1f3f7",
        },
      },
      /* ─── Shadows ────────────────────────────────────────────────────── */
      boxShadow: {
        "brand-sm": "0 1px 3px 0 rgba(79,70,229,0.15)",
        "brand-md": "0 4px 16px 0 rgba(79,70,229,0.20)",
        "brand-lg": "0 8px 32px 0 rgba(79,70,229,0.25)",
        "card":     "0 10px 40px -10px rgba(0,0,0,0.04)",
        "card-hover": "0 4px 16px 0 rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.06)",
      },
      /* ─── Border radius ──────────────────────────────────────────────── */
      borderRadius: {
        "2xl": "1.25rem",
        "3xl": "1.5rem",
        "4xl": "2rem",
      },
      minHeight: {
        screen: "100vh",
        "screen-dvh": "100dvh",
      },
      height: {
        "screen-dvh": "100dvh",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "spin-slow": "spin 8s linear infinite",
      },
    },
  },
  plugins: [
    require("tailwindcss-animate"),
    function ({ addUtilities, theme }) {
      addUtilities({
        ".bg-grid-white": {
          "background-image": `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32' width='32' height='32' fill='none' stroke='white' stroke-opacity='0.05'%3e%3cpath d='M0 .5H31.5V32'/%3e%3c/svg%3e")`,
        },
        ".bg-grid-indigo": {
          "background-image": `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32' width='32' height='32' fill='none' stroke='%234f46e5' stroke-opacity='0.1'%3e%3cpath d='M0 .5H31.5V32'/%3e%3c/svg%3e")`,
        },
      });
    },
  ],
};
