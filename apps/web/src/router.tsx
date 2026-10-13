import { createBrowserRouter, Navigate } from "react-router";

import { AuthLayout } from "@/components/layouts/AuthLayout";
import { CmsLayout } from "@/components/layouts/CmsLayout";
import { ForgotPasswordPage } from "@/pages/auth/ForgotPasswordPage";
import { LoginPage } from "@/pages/auth/LoginPage";
import { DashboardPage } from "@/pages/cms/DashboardPage";

export const router = createBrowserRouter([
  {
    element: <AuthLayout />,
    children: [
      { path: "/login", element: <LoginPage /> },
      { path: "/forgot-password", element: <ForgotPasswordPage /> },
    ],
  },
  {
    element: <CmsLayout />,
    children: [{ path: "/", element: <DashboardPage /> }],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
