import { Table, Tag } from "antd";
import { useState } from "react";

import { useAdmins } from "@/features/admins/hooks";
import type { Admin } from "@/features/admins/types";

const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString() : "-";

export function AdminsPage() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const { data, isFetching } = useAdmins({ page, limit });

  return (
    <Table<Admin>
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
          render: (s: Admin["status"]) => (
            <Tag color={s === "ACTIVE" ? "green" : "red"}>{s}</Tag>
          ),
        },
        { title: "Created", dataIndex: "createdAt", render: formatDate },
        { title: "Last login", dataIndex: "lastLoginAt", render: formatDate },
      ]}
    />
  );
}
