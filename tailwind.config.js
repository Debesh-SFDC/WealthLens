/** @type {import('tailwindcss').Config} */
const defaultColors = require('tailwindcss/colors')

// Black & Gold theme.
// The gray scale is inverted so existing light-theme classes (bg-gray-50,
// text-gray-900, border-gray-200, …) render as dark surfaces / light text.
const gray = {
  50:  '#171717',
  100: '#1F1F1F',
  200: '#2A2A2A',
  300: '#3A3A3A',
  400: '#6B6B6B',
  500: '#8A8A8A',
  600: '#A0A0A0',
  700: '#C4C4C4',
  800: '#E5E5E5',
  900: '#F5F5F5',
  950: '#FAFAFA',
}

// Mix a hex color into the card background (#111111) to get a dark tint
function tint(hex, amount) {
  const base = [0x11, 0x11, 0x11]
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
  return '#' + c.map((v, i) => Math.round(base[i] + (v - base[i]) * amount).toString(16).padStart(2, '0')).join('')
}

// Chromatic palettes: light tints (50–200) become dark tints, dark text
// shades (700–900) become light so they stay readable on black.
function darkPalette(p) {
  return {
    ...p,
    50:  tint(p[500], 0.12),
    100: tint(p[500], 0.18),
    200: tint(p[500], 0.30),
    700: p[400],
    800: p[300],
    900: p[200],
  }
}

// Gold scale stands in for indigo (the old brand accent's Tailwind shade)
const goldScale = {
  50: '#FBF6E3', 100: '#F6ECC4', 200: '#F0DE95', 300: '#F0D060', 400: '#E2C04A',
  500: '#D4AF37', 600: '#B8960C', 700: '#9A7D0A', 800: '#7A6308', 900: '#5C4A06', 950: '#3D3104',
}

const chromatic = ['red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal',
  'cyan', 'sky', 'blue', 'violet', 'purple', 'fuchsia', 'pink', 'rose']

module.exports = {
  content: [
    './src/renderer/**/*.{html,js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
      colors: {
        gray,
        slate: gray,
        ...Object.fromEntries(chromatic.map(k => [k, darkPalette(defaultColors[k])])),
        indigo: darkPalette(goldScale),
        gold: {
          DEFAULT: '#D4AF37',
          light: '#F0D060',
          dark: '#B8960C',
          muted: '#8B7320',
        },
        dark: {
          DEFAULT: '#0A0A0A',
          card: '#111111',
          elevated: '#1A1A1A',
          hover: '#222222',
          border: '#2A2A2A',
        },
        accent: '#D4AF37',
        'accent-light': '#F0D060',
        'accent-dark': '#B8960C',
        sidebar: '#050505',
        'sidebar-hover': '#111111',
      },
      boxShadow: {
        sm: '0 4px 24px rgba(0,0,0,0.4)',
        DEFAULT: '0 4px 24px rgba(0,0,0,0.45)',
        md: '0 6px 28px rgba(0,0,0,0.5)',
        lg: '0 10px 40px rgba(0,0,0,0.55)',
        xl: '0 16px 48px rgba(0,0,0,0.6)',
        '2xl': '0 24px 64px rgba(0,0,0,0.7)',
        gold: '0 0 20px rgba(212,175,55,0.3)',
      },
    },
  },
  plugins: [],
}
