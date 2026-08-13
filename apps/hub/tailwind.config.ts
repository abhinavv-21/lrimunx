import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#F8FAFC',
        surface: {
          DEFAULT: '#FFFFFF',
          sunken: '#F1F5F9',
          inverted: '#2F0924',
        },
        ink: {
          DEFAULT: '#1A0715',
          secondary: '#4A3D46',
          tertiary: '#96878F',
          inverted: '#FBF7FA',
        },
        accent: {
          DEFAULT: '#B41884',
          hover: '#98136F',
          pressed: '#7C0F5A',
          wash: '#FDF2F9',
          bright: '#E24BA8',
        },
        success: { DEFAULT: '#15803D', wash: '#F0FDF4' },
        warning: { DEFAULT: '#B45309', wash: '#FFFBEB' },
        danger: { DEFAULT: '#991B1B', wash: '#FEF2F2' },
        info: { DEFAULT: '#1D4ED8', wash: '#EFF6FF' },
        edge: {
          DEFAULT: '#E2E8F0',
          strong: '#CBD5E1',
        },
        focus: '#1D4ED8',
      },
      fontFamily: {
        heading: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        display: ['40px', { lineHeight: '1.1', fontWeight: '700', letterSpacing: '-0.02em' }],
        h1: ['28px', { lineHeight: '1.2', fontWeight: '700', letterSpacing: '-0.02em' }],
        h2: ['20px', { lineHeight: '1.25', fontWeight: '600', letterSpacing: '-0.02em' }],
        h3: ['16px', { lineHeight: '1.35', fontWeight: '600' }],
        body: ['15px', { lineHeight: '1.55' }],
        'body-sm': ['13px', { lineHeight: '1.5' }],
        label: ['11px', { lineHeight: '1.4', fontWeight: '600', letterSpacing: '0.06em' }],
        data: ['13px', { lineHeight: '1.5' }],
      },
      spacing: {
        row: '52px',
        'row-mobile': '56px',
        tap: '48px',
        rail: '64px',
        sidebar: '240px',
        tabbar: '56px',
        rule: '3px',
      },
      borderRadius: {
        control: '6px',
        card: '10px',
        pill: '999px',
      },
      boxShadow: {
        raised: '0 1px 2px rgba(26, 7, 21, 0.08)',
        overlay: '0 12px 32px rgba(26, 7, 21, 0.18)',
      },
      transitionTimingFunction: {
        standard: 'cubic-bezier(0.2, 0, 0, 1)',
      },
      transitionDuration: {
        micro: '120ms',
        standard: '180ms',
        overlay: '240ms',
      },
      maxWidth: {
        prose: '68ch',
        cell: '22ch',
        app: '1440px',
      },
      zIndex: {
        popover: '60',
      },
      screens: {
        xs: '390px',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'slide-up': {
          from: { transform: 'translateY(8px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
        'dialog-in': {
          from: { transform: 'translate(-50%, calc(-50% + 8px))', opacity: '0' },
          to: { transform: 'translate(-50%, -50%)', opacity: '1' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.4s linear infinite',
        'slide-up': 'slide-up 180ms cubic-bezier(0.2, 0, 0, 1)',
        'dialog-in': 'dialog-in 180ms cubic-bezier(0.2, 0, 0, 1)',
      },
    },
  },
  plugins: [],
} satisfies Config
