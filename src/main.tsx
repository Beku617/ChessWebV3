import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import "./i18n";
import i18n from "./i18n";
import { I18nextProvider } from "react-i18next";
import { applyThemeClass, readStoredTheme } from "./utils/theme";

applyThemeClass(readStoredTheme());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#f5f5f7] dark:bg-gray-950 text-gray-700 dark:text-gray-200">
          <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <I18nextProvider i18n={i18n}>
        <App />
      </I18nextProvider>
    </Suspense>
  </StrictMode>
);

