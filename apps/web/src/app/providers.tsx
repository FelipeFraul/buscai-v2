import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";

import { AuthProvider } from "@/features/auth/AuthProvider";
import { ToastProvider } from "@/components/ui/ToastProvider";
import { queryClient } from "@/lib/api/queryClient";

import { router } from "./routes";

export const AppProviders = () => (
  <AuthProvider>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>
  </AuthProvider>
);
