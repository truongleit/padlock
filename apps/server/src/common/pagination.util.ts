import type { ListQueryDto } from "@/common/dto/list-query.dto";

export function pageArgs(q: ListQueryDto) {
  return { skip: (q.page - 1) * q.limit, take: q.limit };
}

export function paginated<T>(data: T[], q: ListQueryDto, total: number) {
  return { data, page: q.page, limit: q.limit, total };
}
