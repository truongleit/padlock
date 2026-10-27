import { createBrowserRouter, Navigate } from "react-router";

import { RedirectIfAuthed } from "@/components/auth/RedirectIfAuthed";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { AuthLayout } from "@/components/layouts/AuthLayout";
import { CmsLayout } from "@/components/layouts/CmsLayout";
import { ForgotPasswordPage } from "@/pages/auth/ForgotPasswordPage";
import { LoginPage } from "@/pages/auth/LoginPage";
import { AdminsPage } from "@/pages/cms/AdminsPage";
import { AuditPage } from "@/pages/cms/AuditPage";
import { DashboardPage } from "@/pages/cms/DashboardPage";
import { UsersPage } from "@/pages/cms/UsersPage";

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
          { path: "/users", element: <UsersPage /> },
          { path: "/admins", element: <AdminsPage /> },
          { path: "/audit", element: <AuditPage /> },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
