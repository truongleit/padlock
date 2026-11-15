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
import { useHashPath, useRedirect } from "@/lib/router";

const LOCKED_ROUTES = ["/login", "/forgot", "/reset", "/recovery-key"];

/** Hash routes; locked and unlocked screens are separate so nothing leaks while locked. */
export function App() {
  const { status, items } = useVault();
  const path = useHashPath();
  const [, section, id, action] = path.split("/");
  const fallback =
    status === "none"
      ? // signup navigates here before the storage watcher reports "unlocked"
        path === "/signup" || path === "/recovery-key"
        ? null
        : "/signup"
      : status === "locked"
        ? LOCKED_ROUTES.includes(path)
          ? null
          : "/login"
        : status === "unlocked" &&
            LOCKED_ROUTES.slice(0, 3).concat("/signup", "/").includes(path)
          ? "/vault"
          : null;
  useRedirect(fallback !== null, fallback ?? "");

  if (status === "loading" || fallback) return null;
  if (path === "/recovery-key") return <RecoveryKeyPage />;
  if (status === "none") return <SignupPage />;
  if (status === "locked") {
    if (path === "/forgot") return <ForgotPasswordPage />;
    if (path === "/reset") return <ResetPasswordPage />;
    return <LoginPage />;
  }

  if (section === "generator")
    return id === "interview" ? (
      <InterviewPage path={path} />
    ) : (
      <GeneratorPage path={path} />
    );
  if (section === "security") return <SecurityPage path={path} />;
  if (section === "settings") return <SettingsPage path={path} />;
  if (section === "vault" && id === "new")
    return <CredentialFormPage path={path} />;
  const item =
    section === "vault" && id ? items.find((i) => i.id === id) : undefined;
  if (item) {
    if (action === "edit")
      return <CredentialFormPage existing={item} key={item.id} path={path} />;
    if (action === "rotate")
      return <RotatePasswordPage item={item} path={path} />;
    return <CredentialDetailPage item={item} path={path} />;
  }
  return <VaultPage path={path} />;
}
