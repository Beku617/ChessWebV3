export default {
  locales: ["en", "mn"],
  defaultNamespace: "translation",
  input: ["src/**/*.{js,jsx,ts,tsx}"],
  output: "src/locales/$LOCALE/translation.json",
  namespaceSeparator: false,
  createOldCatalogs: false,
  keepRemoved: false,
};
