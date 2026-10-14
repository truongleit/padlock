import { Navigate, Outlet } from "react-router";

import { FullPageSpin } from "@/components/auth/FullPageSpin";
import { useSession } from "@/features/auth/hooks";

export function RedirectIfAuthed() {
  const { isPending, isSuccess } = useSession();

  if (isPending) return <FullPageSpin />;
  if (isSuccess) return <Navigate to="/" replace />;
  return <Outlet />;
}
