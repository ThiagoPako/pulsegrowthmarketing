import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      fontFamily: {
        display: ["Space Grotesk", "sans-serif"],
        body: ["Inter", "sans-serif"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        success: { DEFAULT: "hsl(var(--success))", foreground: "hsl(var(--success-foreground))" },
        warning: { DEFAULT: "hsl(var(--warning))", foreground: "hsl(var(--warning-foreground))" },
        info: { DEFAULT: "hsl(var(--info))", foreground: "hsl(var(--info-foreground))" },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
        "pulse-ring": {
          "0%": { transform: "scale(0.95)", opacity: "1" },
          "100%": { transform: "scale(1.3)", opacity: "0" },
        },
        "soft-pulse": {
          "0%, 100%": { opacity: "1", boxShadow: "0 0 0 0 hsl(45 95% 55% / 0.35)" },
          "50%": { opacity: "0.92", boxShadow: "0 0 0 8px hsl(45 95% 55% / 0)" },
        },
        "soft-glow": {
          "0%, 100%": { opacity: "0.85" },
          "50%": { opacity: "1" },
        },
        // Kanban: card chegando (entra de leve) e card que acabou de mudar de coluna (brilho que some)
        "kanban-in": {
          from: { opacity: "0", transform: "translateY(6px) scale(0.985)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        "kanban-flash": {
          "0%": { boxShadow: "0 0 0 0 hsl(var(--primary) / 0.65)", transform: "scale(1.02)" },
          "40%": { boxShadow: "0 0 0 6px hsl(var(--primary) / 0.25)", transform: "scale(1)" },
          "100%": { boxShadow: "0 0 0 0 hsl(var(--primary) / 0)" },
        },
        "kanban-bump": {
          "0%": { transform: "scale(1)" },
          "40%": { transform: "scale(1.25)" },
          "100%": { transform: "scale(1)" },
        },
        // card que um agente está fazendo agora: faixa de cor correndo, brilho pulsando e reflexo na barra
        "agent-flow": {
          "0%": { backgroundPosition: "0% 50%" },
          "100%": { backgroundPosition: "200% 50%" },
        },
        "agent-glow": {
          "0%, 100%": { boxShadow: "0 0 0 1px hsl(217 91% 60% / 0.55), 0 0 10px 0 hsl(217 91% 60% / 0.25)" },
          "50%": { boxShadow: "0 0 0 2px hsl(217 91% 60% / 0.9), 0 0 22px 2px hsl(217 91% 60% / 0.45)" },
        },
        "agent-shimmer": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "pulse-ring": "pulse-ring 1.5s ease-out infinite",
        "soft-pulse": "soft-pulse 3s ease-in-out infinite",
        "soft-glow": "soft-glow 2.5s ease-in-out infinite",
        "kanban-in": "kanban-in 0.28s cubic-bezier(0.2, 0.8, 0.2, 1) both",
        "kanban-flash": "kanban-flash 1.4s ease-out",
        "kanban-bump": "kanban-bump 0.35s ease-out",
        "agent-flow": "agent-flow 3s linear infinite",
        "agent-glow": "agent-glow 2s ease-in-out infinite",
        "agent-shimmer": "agent-shimmer 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
