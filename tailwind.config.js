/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./*.{html,js}", "./assets/js/*.js"],
  darkMode: 'media', // or 'class'
  theme: {
    extend: {
      colors: {
        // Material Design 3 颜色系统 - 支持亮色和暗色模式
        'primary': {
          DEFAULT: 'var(--md-sys-color-primary)',
          dark: 'var(--md-sys-color-primary)'
        },
        'on-primary': {
          DEFAULT: 'var(--md-sys-color-on-primary)',
          dark: 'var(--md-sys-color-on-primary)'
        },
        'primary-container': {
          DEFAULT: 'var(--md-sys-color-primary-container)',
          dark: 'var(--md-sys-color-primary-container)'
        },
        'on-primary-container': {
          DEFAULT: 'var(--md-sys-color-on-primary-container)',
          dark: 'var(--md-sys-color-on-primary-container)'
        },
        
        'secondary': {
          DEFAULT: 'var(--md-sys-color-secondary)',
          dark: 'var(--md-sys-color-secondary)'
        },
        'on-secondary': {
          DEFAULT: 'var(--md-sys-color-on-secondary)',
          dark: 'var(--md-sys-color-on-secondary)'
        },
        'secondary-container': {
          DEFAULT: 'var(--md-sys-color-secondary-container)',
          dark: 'var(--md-sys-color-secondary-container)'
        },
        'on-secondary-container': {
          DEFAULT: 'var(--md-sys-color-on-secondary-container)',
          dark: 'var(--md-sys-color-on-secondary-container)'
        },
        
        'tertiary': {
          DEFAULT: 'var(--md-sys-color-tertiary)',
          dark: 'var(--md-sys-color-tertiary)'
        },
        'on-tertiary': {
          DEFAULT: 'var(--md-sys-color-on-tertiary)',
          dark: 'var(--md-sys-color-on-tertiary)'
        },
        'tertiary-container': {
          DEFAULT: 'var(--md-sys-color-tertiary-container)',
          dark: 'var(--md-sys-color-tertiary-container)'
        },
        'on-tertiary-container': {
          DEFAULT: 'var(--md-sys-color-on-tertiary-container)',
          dark: 'var(--md-sys-color-on-tertiary-container)'
        },
        
        'error': {
          DEFAULT: 'var(--md-sys-color-error)',
          dark: 'var(--md-sys-color-error)'
        },
        'on-error': {
          DEFAULT: 'var(--md-sys-color-on-error)',
          dark: 'var(--md-sys-color-on-error)'
        },
        'error-container': {
          DEFAULT: 'var(--md-sys-color-error-container)',
          dark: 'var(--md-sys-color-error-container)'
        },
        'on-error-container': {
          DEFAULT: 'var(--md-sys-color-on-error-container)',
          dark: 'var(--md-sys-color-on-error-container)'
        },
        
        'surface': {
          DEFAULT: 'var(--md-sys-color-surface)',
          dark: 'var(--md-sys-color-surface)'
        },
        'on-surface': {
          DEFAULT: 'var(--md-sys-color-on-surface)',
          dark: 'var(--md-sys-color-on-surface)'
        },
        'surface-variant': {
          DEFAULT: 'var(--md-sys-color-surface-variant)',
          dark: 'var(--md-sys-color-surface-variant)'
        },
        'on-surface-variant': {
          DEFAULT: 'var(--md-sys-color-on-surface-variant)',
          dark: 'var(--md-sys-color-on-surface-variant)'
        },
        
        'outline': {
          DEFAULT: 'var(--md-sys-color-outline)',
          dark: 'var(--md-sys-color-outline)'
        },
        'outline-variant': {
          DEFAULT: 'var(--md-sys-color-outline-variant)',
          dark: 'var(--md-sys-color-outline-variant)'
        },
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