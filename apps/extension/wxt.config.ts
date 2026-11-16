import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

export default defineConfig({
  srcDir: "src",
  modules: ["@wxt-dev/module-react"],
  // A function so the .env files WXT loads are already in process.env.
  manifest: () => ({
    name: "Padlock",
    // Public key only: pins the unpacked ID to chrome-extension://lmnimgnengbkccilbagddlaaahgnebop
    // so the API can list it in ADMIN_EXTRA_ORIGINS. Once published, swap in the Web Store's public key
    // (Developer Dashboard → Package → View public key) so local and store IDs match.
    key: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAxPRBjb39EHbtbfsH2CWwDawNJpSyMmqOIvreIrUQTUs6IRqzDuxh33yLHzZlyg1txedgl1p4n3SPkQEjqturaQ5OisBsyP1KXlmlp2UORhv0eSTZAwMXYmAJXp3bl4EB2AhBdIe0yWfxBOQwCYr2zVE5obzhB023Nyc91GOZQG7+3rGKTRz+dl6Xlq6AdD70F2+pU1eY9fqo+nm4dJ/ADZEkteOKV2WSxMvFCZAJ+k7Gu05Fo+Y312UWtucy4J3S4QUZn6O8LY9xlbZvaKr9awzYrVf5MubToMXLAhMxY4tObhPtJUJ219TSL89AulSuVg/OZfHvSeDOCl92MlwXKQIDAQAB",
    // storage: vault + session key; alarms: auto-lock; activeTab + scripting: autofill.
    permissions: [
      "storage",
      "alarms",
      "activeTab",
      "scripting",
      "clipboardWrite",
    ],
    // Lets extension pages call the API; the server must still allow the origin above (CORS).
    host_permissions: process.env.WXT_API_URL
      ? [`${new URL(process.env.WXT_API_URL).origin}/*`]
      : [],
  }),
  vite: () => ({ plugins: [tailwindcss()] }),
});
