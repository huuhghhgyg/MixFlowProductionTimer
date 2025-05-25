/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./*.{html,js}", "./assets/js/*.js"],
  darkMode: 'media', // or 'class'
  theme: {
    extend: {
      colors: {
        'primary': { DEFAULT: '#B95E20', dark: '#F97316' },
        'on-primary': { DEFAULT: '#FFFFFF', dark: '#000000' },
        'primary-container': { DEFAULT: '#FFDBCA', dark: '#7C2D03' },
        'on-primary-container': { DEFAULT: '#3A1800', dark: '#FFEDD5' },
        'secondary': { DEFAULT: '#A08C7D', dark: '#A08C7D' },
        'on-secondary': { DEFAULT: '#FFFFFF', dark: '#FFFFFF' },
        'secondary-container': { DEFAULT: '#FFDBCA', dark: '#FFDBCA' },
        'on-secondary-container': { DEFAULT: '#2C160A', dark: '#2C160A' },
        'tertiary': { DEFAULT: '#705D50', dark: '#705D50' },
        'on-tertiary': { DEFAULT: '#FFFFFF', dark: '#FFFFFF' },
        'tertiary-container': { DEFAULT: '#FFDBCA', dark: '#FFDBCA' },
        'on-tertiary-container': { DEFAULT: '#291807', dark: '#291807' },
        'error': { DEFAULT: '#B3261E', dark: '#EF4444' },
        'on-error': { DEFAULT: '#FFFFFF', dark: '#F3F4F6' },
        'error-container': { DEFAULT: '#F9DEDC', dark: '#7F1D1D' },
        'on-error-container': { DEFAULT: '#410E0B', dark: '#410E0B' },
        'surface': { DEFAULT: '#FFF8F6', dark: '#1F2937' },
        'on-surface': { DEFAULT: '#201A18', dark: '#F3F4F6' },
        'surface-variant': { DEFAULT: '#F4DED4', dark: '#374151' },
        'on-surface-variant': { DEFAULT: '#52443D', dark: '#E5E7EB' },
        'outline': { DEFAULT: '#85746B', dark: '#4B5563' },
        'outline-variant': { DEFAULT: '#D7C2B9', dark: '#D7C2B9' },
      },
      fontFamily: {
        sans: ['Google Sans Text', 'system-ui', 'sans-serif'],
        display: ['Google Sans Display', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'display-large': '3.5rem',    // 56px
        'display-medium': '2.8rem',   // 45px (approx)
        'body': '0.875rem',         // 14px (Tailwind sm)
        'headline-small': '1.25rem' // 20px (Tailwind xl)
      },
      letterSpacing: {
        tighter: '-0.025em', // for display-large
        normal: '0', // for headline-small (default)
      },
      borderRadius: {
        'md-small': '8px',
        'md-medium': '12px',
        'md-large': '16px',
        'md-extra-large': '28px',
      }
    },
  },
  plugins: [],
} 