import type { AuditListParams, AuditLog } from "@/features/audit/types";
import { api } from "@/lib/api/client";
import type { Paginated } from "@/lib/api/types";

export const listAuditLogs = (params: AuditListParams = {}) =>
  api
    .get("admin/audit-logs", { searchParams: { ...params } })
    .json<Paginated<AuditLog>>();
