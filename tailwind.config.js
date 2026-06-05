/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./{components,hooks,services,layout}/**/*.{ts,tsx,js,jsx}",
    "./*.{ts,tsx,js,jsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
