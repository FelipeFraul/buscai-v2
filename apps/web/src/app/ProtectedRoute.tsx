import { Navigate, Outlet } from "react-router-dom";

import { useAuth } from "@/features/auth/AuthContext";

export const ProtectedRoute = () => {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Onboarding removido; sempre liberar acesso

  return <Outlet />;
};
