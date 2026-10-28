import { describe, expect, it } from "vitest";

import { pageArgs, paginated } from "@/common/pagination.util";

describe("pagination.util", () => {
  it("pageArgs converts 1-based page to skip/take", () => {
    expect(pageArgs({ page: 1, limit: 20 })).toEqual({ skip: 0, take: 20 });
    expect(pageArgs({ page: 3, limit: 10 })).toEqual({ skip: 20, take: 10 });
  });

  it("paginated wraps rows with page, limit and total", () => {
    expect(paginated(["a"], { page: 2, limit: 5 }, 11)).toEqual({
      data: ["a"],
      page: 2,
      limit: 5,
      total: 11,
    });
  });
});
