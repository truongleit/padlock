import { createBrowserRouter, Navigate } from "react-router";

import { RedirectIfAuthed } from "@/components/auth/RedirectIfAuthed";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { AuthLayout } from "@/components/layouts/AuthLayout";
import { CmsLayout } from "@/components/layouts/CmsLayout";
import { ForgotPasswordPage } from "@/pages/auth/ForgotPasswordPage";
import { LoginPage } from "@/pages/auth/LoginPage";
import { AdminsPage } from "@/pages/cms/AdminsPage";
import { DashboardPage } from "@/pages/cms/DashboardPage";

export const router = createBrowserRouter([
  {
    element: <RedirectIfAuthed />,
    children: [
      {
        element: <AuthLayout />,
        children: [
          { path: "/login", element: <LoginPage /> },
          { path: "/forgot-password", element: <ForgotPasswordPage /> },
        ],
      },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <CmsLayout />,
        children: [
          { path: "/", element: <DashboardPage /> },
          { path: "/admins", element: <AdminsPage /> },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
