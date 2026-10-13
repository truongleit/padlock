import { Controller, Get, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse } from "@nestjs/swagger";

import { AdminAuditLogService } from "@/admin/audit/admin-audit.service";
import { AuditListDto } from "@/admin/audit/dto/audit-log.dto";
import { ListAuditQueryDto } from "@/admin/audit/dto/list-audit-query.dto";
import { ApiErrorResponses } from "@/common/errors/api-error-responses.decorator";

@Controller("admin/audit-logs")
@ApiBearerAuth()
@ApiErrorResponses()
export class AdminAuditLogController {
  constructor(private readonly auditLogs: AdminAuditLogService) {}

  @Get()
  @ApiOkResponse({ type: AuditListDto })
  list(@Query() q: ListAuditQueryDto) {
    return this.auditLogs.list(q);
  }
}
