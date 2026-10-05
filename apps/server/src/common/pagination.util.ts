import type { PaginationQueryDto } from "@/common/dto/pagination-query.dto";

export function pageArgs(q: PaginationQueryDto) {
  return { skip: (q.page - 1) * q.limit, take: q.limit };
}

export function paginated<T>(data: T[], q: PaginationQueryDto, total: number) {
  return { data, page: q.page, limit: q.limit, total };
}
