import { Table, Tag, Typography } from "antd";
import { useState } from "react";

import { useAuditLogs } from "@/features/audit/hooks";
import type { AuditAction, AuditLog } from "@/features/audit/types";

const actionColor: Record<AuditAction, string> = {
  DISABLE: "orange",
  REACTIVATE: "green",
  DELETE: "red",
};

export function AuditPage() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  const { data, isFetching } = useAuditLogs({ page, limit });

  return (
    <>
      <Typography.Title level={3}>Audit log</Typography.Title>
      <Table<AuditLog>
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
          {
            title: "Time",
            dataIndex: "createdAt",
            render: (iso: string) => new Date(iso).toLocaleString(),
          },
          { title: "Admin", dataIndex: "adminEmail" },
          {
            title: "Action",
            dataIndex: "action",
            render: (a: AuditAction) => <Tag color={actionColor[a]}>{a}</Tag>,
          },
          {
            title: "Target user",
            dataIndex: "targetUserId",
            render: (id: string) => (
              <Typography.Text copyable>{id}</Typography.Text>
            ),
          },
        ]}
      />
    </>
  );
}
