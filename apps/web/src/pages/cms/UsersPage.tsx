import { Table, Tag } from "antd";
import { useState } from "react";

import { useUsers } from "@/features/users/hooks";
import type { User } from "@/features/users/types";

const formatDate = (iso: string) => new Date(iso).toLocaleString();

export function UsersPage() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const { data, isFetching } = useUsers({ page, limit });

  return (
    <Table<User>
      rowKey="id"
      loading={isFetching}
      dataSource={data?.data}
      scroll={{ x: "max-content" }}
      pagination={{
        current: page,
        pageSize: limit,
        total: data?.total,
        onChange: (p, l) => {
          setPage(p);
          setLimit(l);
        },
      }}
      columns={[
        { title: "Email", dataIndex: "email" },
        {
          title: "Status",
          dataIndex: "status",
          render: (s: User["status"]) => (
            <Tag color={s === "ACTIVE" ? "green" : "red"}>{s}</Tag>
          ),
        },
        { title: "Created", dataIndex: "createdAt", render: formatDate },
      ]}
    />
  );
}
