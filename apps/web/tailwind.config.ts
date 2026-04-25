import type { Config } from 'tailwindcss';

/**
 * Al-Ruya ERP — Design System
 *
 * Iraqi-flavored, Arabic-first, professional ERP aesthetic.
 * Tokens are also exported as CSS vars in globals.css for runtime theming.
 */
const config: Config = {
  content: [
    './src/**/*.{ts,tsx,js,jsx,mdx}',
    './src/app/**/*.{ts,tsx,mdx}',
    './src/components/**/*.{ts,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    container: {
      center: true,
      padding: '1.5rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        // ─── Brand ─────────────────────────────────────────────────────────
        // Sky-700 family — trustworthy, financial, calm
        brand: {
          50:  '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',  // primary
          800: '#075985',
          900: '#0c4a6e',
          950: '#082f49',
        },
        // ─── Surfaces (light/dark friendly) ───────────────────────────────
        surface: {
          DEFAULT: '#ffffff',
          subtle:  '#f8fafc',  // slate-50
          muted:   '#f1f5f9',  // slate-100
          elevated:'#ffffff',
          inverse: '#0f172a',  // slate-900
        },
        // ─── Borders ─────────────────────────────────────────────────────
        line: {
          DEFAULT: '#e2e8f0',  // slate-200
          strong:  '#cbd5e1',  // slate-300
          subtle:  '#f1f5f9',
        },
        // ─── Text ────────────────────────────────────────────────────────
        ink: {
          DEFAULT: '#0f172a',   // slate-900 — body
          strong:  '#020617',   // slate-950 — headings
          muted:   '#475569',   // slate-600 — secondary
          subtle:  '#94a3b8',   // slate-400 — meta
          inverse: '#ffffff',
        },
        // ─── Status colors ───────────────────────────────────────────────
        success: { 50:'#f0fdf4', 100:'#dcfce7', 500:'#22c55e', 600:'#16a34a', 700:'#15803d' },
        warning: { 50:'#fffbeb', 100:'#fef3c7', 500:'#f59e0b', 600:'#d97706', 700:'#b45309' },
        danger:  { 50:'#fef2f2', 100:'#fee2e2', 500:'#ef4444', 600:'#dc2626', 700:'#b91c1c' },
        info:    { 50:'#eff6ff', 100:'#dbeafe', 500:'#3b82f6', 600:'#2563eb', 700:'#1d4ed8' },
      },
      fontFamily: {
        sans: ['var(--font-arabic)', 'Cairo', 'IBM Plex Sans Arabic', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        // Display sizes for big numbers / KPIs
        'display-lg': ['3rem',    { lineHeight: '1.1', fontWeight: '700' }],
        'display-md': ['2.25rem', { lineHeight: '1.15', fontWeight: '700' }],
        'display-sm': ['1.875rem',{ lineHeight: '1.2',  fontWeight: '700' }],
      },
      borderRadius: {
        sm:  '0.375rem',  // 6px
        md:  '0.5rem',    // 8px
        lg:  '0.75rem',   // 12px
        xl:  '1rem',      // 16px
        '2xl':'1.25rem',  // 20px
      },
      boxShadow: {
        // Subtle elevations — Iraqi enterprise software, not flashy
        'soft':   '0 1px 2px 0 rgb(0 0 0 / 0.04), 0 1px 1px 0 rgb(0 0 0 / 0.03)',
        'card':   '0 1px 3px 0 rgb(0 0 0 / 0.05), 0 1px 2px -1px rgb(0 0 0 / 0.04)',
        'lifted': '0 4px 12px -2px rgb(0 0 0 / 0.08), 0 2px 4px -2px rgb(0 0 0 / 0.04)',
        'panel':  '0 8px 24px -8px rgb(15 23 42 / 0.12), 0 4px 8px -4px rgb(15 23 42 / 0.06)',
      },
      animation: {
        'fade-in':  'fade-in 200ms ease-out',
        'slide-up': 'slide-up 250ms ease-out',
        'pulse-soft': 'pulse-soft 2s ease-in-out infinite',
      },
      keyframes: {
        'fade-in':  { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'pulse-soft':{ '0%,100%': { opacity: '1' }, '50%': { opacity: '0.6' } },
      },
    },
  },
  plugins: [],
};

export default config;
