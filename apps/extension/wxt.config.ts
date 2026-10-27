import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

export default defineConfig({
  srcDir: "src",
  modules: ["@wxt-dev/module-react"],
  manifest: { name: "Padlock" },
  vite: () => ({ plugins: [tailwindcss()] }),
});
