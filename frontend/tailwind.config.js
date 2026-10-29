/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        secondary: ['Arimo', 'sans-serif'],
      },
      colors: {
        primary: {
          DEFAULT: '#2563eb',
          hover: '#1d4ed8',
          light: '#eff6ff',
          lighter: '#dbeafe',
          dark: '#1e40af',
        },
        border: '#e6eaf2',
        success: { DEFAULT: '#22c55e', light: '#f0fdf4', dark: '#16a34a' },
        warning: { DEFAULT: '#f59e0b', light: '#fffbeb', dark: '#d97706' },
        danger: { DEFAULT: '#ef4444', light: '#fef2f2', dark: '#dc2626' },
        purple: { light: '#faf5ff', DEFAULT: '#8b5cf6' },
        heading: '#111827',
        body: '#64748b',
        muted: '#94a3b8',
        surface: '#f8fafc',
      },
      borderRadius: {
        card: '12px',
        btn: '10px',
        badge: '6px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06)',
        'card-hover': '0 4px 12px rgba(0,0,0,0.06)',
        modal: '0 20px 60px rgba(0,0,0,0.15)',
        'input-focus': '0 0 0 3px rgba(37,99,235,0.08)',
      },
      animation: {
        'fade-in': 'fadeIn 0.25s ease-out',
        'slide-up': 'slideUp 0.25s ease-out',
        spin: 'spin 0.6s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        spin: {
          to: { transform: 'rotate(360deg)' },
        },
      },
    },
  },
  plugins: [],
}
