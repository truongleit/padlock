import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@/styles/tailwind.css";
import { Toaster } from "@/components/ui/toaster";
import { VaultProvider } from "@/components/VaultProvider";
import { App } from "@/entrypoints/app/App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <VaultProvider>
      <App />
      <Toaster />
    </VaultProvider>
  </StrictMode>
);
