import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      borderRadius: {
        DEFAULT: '8px',
        none: '0',
        sm: '8px',
        md: '8px',
        lg: '8px',
        xl: '8px',
        '2xl': '8px',
        '3xl': '8px',
        full: '9999px',
      },
      colors: {
        slate: {
          950: '#03071e',
        },
        // Add theme-aware colors
        'theme-primary': 'var(--color-primary)',
        'theme-primary-dark': 'var(--color-primary-dark)',
        'theme-accent': 'var(--color-accent)',
        'theme-accent-dark': 'var(--color-accent-dark)',
        'theme-bg-primary': 'var(--color-bg-primary)',
        'theme-bg-secondary': 'var(--color-bg-secondary)',
        'theme-bg-tertiary': 'var(--color-bg-tertiary)',
        'theme-bg-card': 'var(--color-bg-card)',
        'theme-bg-card-hover': 'var(--color-bg-card-hover)',
        'theme-header-bg': 'var(--color-header-bg)',
        'theme-text-primary': 'var(--color-text-primary)',
        'theme-text-secondary': 'var(--color-text-secondary)',
        'theme-text-muted': 'var(--color-text-muted)',
        'theme-border': 'var(--color-border)',
        'theme-glass-bg': 'var(--color-glass-bg)',
        'theme-glass-border': 'var(--color-glass-border)',
      },
      backdropBlur: {
        xl: '20px',
      },
    },
  },
  plugins: [],
}

export default config
