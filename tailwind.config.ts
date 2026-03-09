import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        terminal: {
          bg: '#0a0e1a',
          panel: '#0f1629',
          border: '#1e2d4a',
        },
        primary: '#e2e8f0',
        muted: '#64748b',
        accent: {
          green: '#00ff88',
          amber: '#f59e0b',
          red: '#ef4444',
          blue: '#3b82f6',
          purple: '#7c3aed',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        pulse_dot: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.3' },
        },
        ticker: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        'pulse-ring': {
          '0%': { opacity: '0.6', transform: 'scale(1)' },
          '100%': { opacity: '0', transform: 'scale(1.5)' },
        },
      },
      animation: {
        'pulse-dot': 'pulse_dot 1.5s ease-in-out infinite',
        'ticker': 'ticker 60s linear infinite',
        'pulse-ring': 'pulse-ring 2s ease-out infinite',
      },
    },
  },
  plugins: [],
};
export default config;
