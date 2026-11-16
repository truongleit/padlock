import {
  createHashRouter,
  Navigate,
  Outlet,
  RouterProvider,
  useLocation,
  useParams,
} from "react-router";

import { useVault } from "@/components/VaultProvider";
import { CredentialDetailPage } from "@/entrypoints/app/pages/CredentialDetailPage";
import { CredentialFormPage } from "@/entrypoints/app/pages/CredentialFormPage";
import { ForgotPasswordPage } from "@/entrypoints/app/pages/ForgotPasswordPage";
import { GeneratorPage } from "@/entrypoints/app/pages/GeneratorPage";
import { InterviewPage } from "@/entrypoints/app/pages/InterviewPage";
import { LoginPage } from "@/entrypoints/app/pages/LoginPage";
import { RecoveryKeyPage } from "@/entrypoints/app/pages/RecoveryKeyPage";
import { ResetPasswordPage } from "@/entrypoints/app/pages/ResetPasswordPage";
import { RotatePasswordPage } from "@/entrypoints/app/pages/RotatePasswordPage";
import { SecurityPage } from "@/entrypoints/app/pages/SecurityPage";
import { SettingsPage } from "@/entrypoints/app/pages/SettingsPage";
import { SignupPage } from "@/entrypoints/app/pages/SignupPage";
import { VaultPage } from "@/entrypoints/app/pages/VaultPage";

/** Waits for the vault state so guards never redirect on the initial "loading". */
function Root() {
  return useVault().status === "loading" ? null : <Outlet />;
}

/** Login, sign-up and reset screens. Forgot/reset need an account on this device (phase 4 lifts that). */
function SignedOut() {
  const { status } = useVault();
  const { pathname } = useLocation();
  if (status === "unlocked") return <Navigate replace to="/vault" />;
  if (status === "none" && (pathname === "/forgot" || pathname === "/reset"))
    return <Navigate replace to="/signup" />;
  if (status === "locked" && pathname === "/signup")
    return <Navigate replace to="/login" />;
  return <Outlet />;
}

/** Everything that shows vault data; nothing renders while locked. */
function Unlocked() {
  const { status } = useVault();
  if (status === "none") return <Navigate replace to="/signup" />;
  if (status === "locked") return <Navigate replace to="/login" />;
  return <Outlet />;
}

function ItemRoute({ view }: { view: "detail" | "edit" | "rotate" }) {
  const { id } = useParams();
  const item = useVault().items.find((i) => i.id === id);
  if (!item) return <Navigate replace to="/vault" />;
  if (view === "edit")
    return <CredentialFormPage existing={item} key={item.id} />;
  if (view === "rotate") return <RotatePasswordPage item={item} />;
  return <CredentialDetailPage item={item} />;
}

const router = createHashRouter([
  {
    element: <Root />,
    children: [
      {
        element: <SignedOut />,
        children: [
          { path: "login", element: <LoginPage /> },
          { path: "signup", element: <SignupPage /> },
          { path: "forgot", element: <ForgotPasswordPage /> },
          { path: "reset", element: <ResetPasswordPage /> },
        ],
      },
      // Any status: sign-up and reset land here right as the vault unlocks.
      { path: "recovery-key", element: <RecoveryKeyPage /> },
      {
        element: <Unlocked />,
        children: [
          { path: "vault", element: <VaultPage /> },
          { path: "vault/new", element: <CredentialFormPage /> },
          { path: "vault/:id", element: <ItemRoute view="detail" /> },
          { path: "vault/:id/edit", element: <ItemRoute view="edit" /> },
          { path: "vault/:id/rotate", element: <ItemRoute view="rotate" /> },
          { path: "generator", element: <GeneratorPage /> },
          { path: "generator/interview", element: <InterviewPage /> },
          { path: "security", element: <SecurityPage /> },
          { path: "settings", element: <SettingsPage /> },
        ],
      },
      { path: "*", element: <Navigate replace to="/vault" /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
