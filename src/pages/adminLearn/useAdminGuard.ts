import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAdminStore } from "../../store/adminStore";

export function useAdminGuard() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, checkAuth } = useAdminStore();

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate("/login");
    }
  }, [isAuthenticated, isLoading, navigate]);

  return {
    isAuthenticated,
    isLoading,
  };
}
