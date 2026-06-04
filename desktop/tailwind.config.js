// tailwind.config.js
const { nextui } = require("@nextui-org/react");

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    // ...
    // make sure it's pointing to the ROOT node_module
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./node_modules/@nextui-org/theme/dist/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  darkMode: "class",
  plugins: [
    nextui({
      layout: {
        dividerWeight: "1px", // h-divider the default height applied to the divider component
        disabledOpacity: 0.5, // this value is applied as opacity-[value] when the component is disabled
        fontSize: {
          tiny: "0.75rem", // text-tiny
          small: "0.875rem", // text-small
          medium: "1rem", // text-medium
          large: "1.125rem", // text-large
        },
        lineHeight: {
          tiny: "1rem", // text-tiny
          small: "1.25rem", // text-small
          medium: "1.5rem", // text-medium
          large: "1.75rem", // text-large
        },
        radius: {
          small: "0px", // rounded-small
          medium: "2px", // rounded-medium
          large: "4px", // rounded-large
        },
        borderWidth: {
          small: "1px", // border-small
          medium: "2px", // border-medium (default)
          large: "3px", // border-large
        },
      },
      themes: {
        light: {},
        dark: {},
        "witch-bolt": {
          extend: "dark", // <- inherit default values from dark theme
          colors: {
            background: "#282A23",
            foreground: "#FEF8D3",
            primary: {
              50: "#ffede7",
              100: "#f1ccc2",
              200: "#e2aa9e",
              300: "#d48577",
              400: "#c75e52",
              500: "#ad4d38",
              600: "#88412b",
              700: "#61321e",
              800: "#3d2111",
              900: "#1c0d00",
              DEFAULT: "#c75e52",
              // foreground: "#FEF8D3",
            },
            focus: "#d48177",
            dark: "#151613",
          },
          layout: {
            disabledOpacity: "0.3",
            radius: {
              small: "4px",
              medium: "6px",
              large: "8px",
            },
            borderWidth: {
              small: "1px",
              medium: "2px",
              large: "3px",
            },
          },
        },
      },
    }),
  ],
};
// bg gradient #1E201A - #282A23

// background #282A23
// text #FEF8D3
// primary #C5594C
// bg-gradient-to-t from-[#1E201A] to-[#282A23]
