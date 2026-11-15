import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

export default defineConfig({
  srcDir: "src",
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Padlock",
    // storage: vault + session key; alarms: auto-lock; activeTab + scripting: autofill.
    permissions: ["storage", "alarms", "activeTab", "scripting", "clipboardWrite"],
  },
  vite: () => ({ plugins: [tailwindcss()] }),
});
