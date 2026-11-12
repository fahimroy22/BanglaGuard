import { api } from "@/lib/api";

import type {
  AuditLogListResponse,
  AuditLogQuery,
  AuditLogRead,
} from "@/types/audit-log";

export async function listAuditLogs(
  query: AuditLogQuery = {},
): Promise<AuditLogListResponse> {
  const response = await api.get<AuditLogListResponse>("/audit-logs", {
    params: {
      search: query.search || undefined,
      action: query.action || undefined,
      resource_type: query.resource_type || undefined,
      user_id: query.user_id || undefined,
      created_from: query.created_from || undefined,
      created_to: query.created_to || undefined,
      limit: query.limit ?? 25,
      offset: query.offset ?? 0,
    },
  });

  return response.data;
}

export async function getAuditLog(auditLogId: string): Promise<AuditLogRead> {
  const response = await api.get<AuditLogRead>(`/audit-logs/${auditLogId}`);

  return response.data;
}
