import { StrictMode, Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { GoogleOAuthProvider } from "@react-oauth/google";
import "./index.css";
import App from "./App.tsx";
import "./i18n";
import i18n from "./i18n";
import { I18nextProvider } from "react-i18next";
import { applyThemeClass, readStoredTheme } from "./utils/theme";
import { loadOAuthConfig, type OAuthConfig } from "./utils/oauthConfig";

applyThemeClass(readStoredTheme());

function Root() {
  const [oauthConfig, setOAuthConfig] = useState<OAuthConfig>({
    googleClientId: "",
    facebookAppId: "",
  });

  useEffect(() => {
    let isMounted = true;
    loadOAuthConfig().then((config) => {
      if (!isMounted) return;
      setOAuthConfig(config);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const appContent = (
    <I18nextProvider i18n={i18n}>
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <App />
      </BrowserRouter>
    </I18nextProvider>
  );

  // Keep provider mounted even if config is unavailable to avoid hook context crashes.
  const googleProviderClientId =
    oauthConfig.googleClientId || "neongambit-google-oauth-disabled";

  return (
    <StrictMode>
      <Suspense
        fallback={
          <div className="min-h-screen flex items-center justify-center bg-[#f5f5f7] dark:bg-gray-950 text-gray-700 dark:text-gray-200">
            <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        }
      >
        <GoogleOAuthProvider clientId={googleProviderClientId}>
          {appContent}
        </GoogleOAuthProvider>
      </Suspense>
    </StrictMode>
  );
}

createRoot(document.getElementById("root")!).render(<Root />);

