import { keepPreviousData, useQuery } from "@tanstack/react-query";

import * as auditApi from "@/features/audit/api";
import type { AuditListParams } from "@/features/audit/types";

export const auditKeys = {
  all: ["audit"] as const,
  list: (params: AuditListParams) =>
    [...auditKeys.all, "list", params] as const,
};

export function useAuditLogs(params: AuditListParams = {}) {
  return useQuery({
    queryKey: auditKeys.list(params),
    queryFn: () => auditApi.listAuditLogs(params),
    placeholderData: keepPreviousData,
  });
}
