export type AuditAction = "DISABLE" | "REACTIVATE" | "DELETE";

export interface AuditLog {
  id: string;
  adminId: string;
  adminEmail: string;
  targetUserId: string;
  action: AuditAction;
  createdAt: string;
}

export interface AuditListParams {
  page?: number;
  limit?: number;
  action?: AuditAction;
  adminId?: string;
  targetUserId?: string;
  from?: string;
  to?: string;
}
