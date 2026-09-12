module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx}',
    './app/**/*.{js,ts,jsx,tsx}',
    './pages/**/*.{js,ts,jsx,tsx}'
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '"Geist Sans"',
          'Geist',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'sans-serif'
        ],
        mono: [
          '"Geist Mono"',
          'GeistMono',
          'ui-monospace',
          'SFMono-Regular',
          '"Roboto Mono"',
          'Menlo',
          'Monaco',
          'monospace'
        ]
      },
      colors: {
        // Locked FEF Primary Palette
        'fef-bg': '#030711',
        'fef-navy': '#07101D',
        'fef-cyan': '#22D3EE',
        'fef-cyan-light': '#67E8F9',
        'fef-blue': '#2563EB',
        'fef-violet': '#7C3AED',
        'fef-bullish': '#34D399',
        'fef-strong-buy': '#10B981',
        'fef-bearish': '#FB7185',
        'fef-danger': '#EF4444',
        'fef-warning': '#FBBF24',
        'fef-text': '#F8FAFC',
        'fef-text-secondary': '#CBD5E1',
        'fef-muted': '#94A3B8',
        'fef-very-muted': '#64748B',

        // Aurora Palette
        'aurora-navy': '#061126',
        'aurora-cyan': '#06B6D4',
        'aurora-blue': '#2563EB',
        'aurora-violet': '#7C3AED',
        'aurora-magenta': '#DB2777',
      }
    }
  },
  plugins: []
};
