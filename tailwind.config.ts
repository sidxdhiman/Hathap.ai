import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        slate: {
          950: '#03071e',
        },
      },
      backdropBlur: {
        xl: '20px',
      },
    },
  },
  plugins: [],
}

export default config
