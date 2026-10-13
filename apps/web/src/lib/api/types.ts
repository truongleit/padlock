export type AccountStatus = "ACTIVE" | "DISABLED";

export interface ListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: AccountStatus;
}

export interface Paginated<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
}
