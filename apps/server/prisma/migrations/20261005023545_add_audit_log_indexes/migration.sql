-- CreateIndex
CREATE INDEX "admin_audit_logs_created_at_idx" ON "admin_audit_logs"("created_at" DESC);

-- CreateIndex
CREATE INDEX "admin_audit_logs_target_user_id_created_at_idx" ON "admin_audit_logs"("target_user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "admin_audit_logs_admin_id_created_at_idx" ON "admin_audit_logs"("admin_id", "created_at" DESC);
