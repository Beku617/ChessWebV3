/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        serif: ["Playfair Display", "serif"],
        mono: ["Roboto Mono", "monospace"],
      },
      colors: {
        // Softer light mode colors
        "light-bg": "#f5f5f7",
        "light-bg-secondary": "#eeeef0",
        "light-card": "#ffffff",
        theme: {
          base: "rgb(var(--bg-base-rgb) / <alpha-value>)",
          surface: "rgb(var(--bg-surface-rgb) / <alpha-value>)",
          panel: "rgb(var(--bg-panel-rgb) / <alpha-value>)",
          card: "rgb(var(--bg-card-rgb) / <alpha-value>)",
          input: "rgb(var(--bg-input-rgb) / <alpha-value>)",
          foreground: "rgb(var(--text-primary-rgb) / <alpha-value>)",
          muted: "rgb(var(--text-secondary-rgb) / <alpha-value>)",
          disabled: "rgb(var(--text-disabled-rgb) / <alpha-value>)",
          onaccent: "rgb(var(--text-on-accent-rgb) / <alpha-value>)",
          border: "rgb(var(--border-color-rgb) / calc(<alpha-value> * 0.28))",
          accent: "rgb(var(--accent-rgb) / <alpha-value>)",
          glass: "rgb(var(--glass-border-rgb) / calc(<alpha-value> * 0.28))",
        },
        // Theme CSS variable colors
        surface: {
          primary: "var(--bg-primary)",
          secondary: "var(--bg-secondary)",
        },
        accent: "var(--accent)",
        // Global brand scale driven by CSS variables in src/index.css
        brand: {
          50: "rgb(var(--color-brand-50-rgb) / <alpha-value>)",
          100: "rgb(var(--color-brand-100-rgb) / <alpha-value>)",
          200: "rgb(var(--color-brand-200-rgb) / <alpha-value>)",
          300: "rgb(var(--color-brand-300-rgb) / <alpha-value>)",
          400: "rgb(var(--color-brand-400-rgb) / <alpha-value>)",
          500: "rgb(var(--color-brand-500-rgb) / <alpha-value>)",
          600: "rgb(var(--color-brand-600-rgb) / <alpha-value>)",
          700: "rgb(var(--color-brand-700-rgb) / <alpha-value>)",
          800: "rgb(var(--color-brand-800-rgb) / <alpha-value>)",
          900: "rgb(var(--color-brand-900-rgb) / <alpha-value>)",
          950: "rgb(var(--color-brand-950-rgb) / <alpha-value>)",
        },
      },
      backgroundColor: {
        // Override white to be slightly gray in light mode
        page: "#f5f5f7",
      },
      borderColor: {
        DEFAULT: "rgb(var(--glass-border-rgb) / 0.2)",
      },
    },
  },
  plugins: [],
};
