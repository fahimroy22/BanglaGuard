export type ApiErrorResponse = {
  detail?: string;
  message?: string;
  error_type?: string;
  request_id?: string;
};

export type PaginatedQuery = {
  limit?: number;
  offset?: number;
};
