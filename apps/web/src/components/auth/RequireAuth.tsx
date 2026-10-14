import { Navigate, Outlet } from "react-router";

import { FullPageSpin } from "@/components/auth/FullPageSpin";
import { useSession } from "@/features/auth/hooks";

export function RequireAuth() {
  const { isPending, isError } = useSession();

  if (isPending) return <FullPageSpin />;
  if (isError) return <Navigate to="/login" replace />;
  return <Outlet />;
}
