/** @type {import('tailwindcss').Config} */
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
        accent: '#6C63FF',
        'accent-light': '#8B85FF',
        'accent-dark': '#5047CC',
        sidebar: '#1a1a2e',
        'sidebar-hover': '#252542',
      },
    },
  },
  plugins: [],
}
