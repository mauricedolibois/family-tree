module.exports = {
  plugins: {
    // Inlines the theme files into globals.css first, so Tailwind sees their @layer rules
    'postcss-import': {},
    tailwindcss: {},
    autoprefixer: {},
  },
}
