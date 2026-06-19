import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import { applyTheme } from "./lib/theme";
import "./index.css";

// Apply the saved theme preference (auto / light / dark) on boot.
applyTheme();

// Service worker (autoUpdate): a new build silently takes over and reloads.
// We also poll for a new deploy hourly and whenever the app regains focus, so a
// PWA left open / backgrounded picks up updates without a manual quit-relaunch.
const updateSW = registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    const check = () => registration.update().catch(() => {});
    setInterval(check, 60 * 60 * 1000);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") check();
    });
  },
  // Fallback if autoUpdate ever surfaces a waiting worker instead of reloading.
  onNeedRefresh() {
    updateSW(true);
  },
});

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000, refetchOnWindowFocus: false } },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
