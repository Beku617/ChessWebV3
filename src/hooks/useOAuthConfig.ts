import { useEffect, useState } from "react";
import { loadOAuthConfig, type OAuthConfig } from "../utils/oauthConfig";

const EMPTY_OAUTH_CONFIG: OAuthConfig = {
  googleClientId: "",
  facebookAppId: "",
};

export function useOAuthConfig() {
  const [oauthConfig, setOAuthConfig] = useState<OAuthConfig>(EMPTY_OAUTH_CONFIG);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    loadOAuthConfig()
      .then((config) => {
        if (!isMounted) return;
        setOAuthConfig(config);
      })
      .finally(() => {
        if (!isMounted) return;
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return {
    oauthConfig,
    isLoading,
    googleClientId: oauthConfig.googleClientId || undefined,
    facebookAppId: oauthConfig.facebookAppId || undefined,
  };
}

