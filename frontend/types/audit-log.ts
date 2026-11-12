export type AuditLogDetails = Record<string, unknown>;

export type AuditLogRead = {
  id: string;

  user_id: string | null;
  user_full_name: string | null;
  user_email: string | null;

  action: string;

  resource_type: string | null;
  resource_id: string | null;

  request_id: string | null;
  ip_address: string | null;
  user_agent: string | null;

  details: AuditLogDetails;

  created_at: string;
};

export type AuditLogListResponse = {
  items: AuditLogRead[];

  total: number;
  limit: number;
  offset: number;

  has_previous: boolean;
  has_next: boolean;
};

export type AuditLogQuery = {
  search?: string;
  action?: string;
  resource_type?: string;
  user_id?: string;

  created_from?: string;
  created_to?: string;

  limit?: number;
  offset?: number;
};
