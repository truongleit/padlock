import { DatePicker, Input, Select, Space, Table, Tag, Typography } from "antd";
import { useState } from "react";

import { useAuditLogs } from "@/features/audit/hooks";
import type { AuditAction, AuditLog } from "@/features/audit/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const actionColor: Record<AuditAction, string> = {
  DISABLE: "orange",
  REACTIVATE: "green",
  DELETE: "red",
};

// The API 400s on a malformed UUID, so only send complete ones.
const validUuid = (v: string) => (UUID.test(v.trim()) ? v.trim() : undefined);

export function AuditPage() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [action, setAction] = useState<AuditAction>();
  const [range, setRange] = useState<[string, string]>();
  const [adminId, setAdminId] = useState("");
  const [targetUserId, setTargetUserId] = useState("");

  const { data, isFetching } = useAuditLogs({
    page,
    limit,
    action,
    from: range?.[0],
    to: range?.[1],
    adminId: validUuid(adminId),
    targetUserId: validUuid(targetUserId),
  });

  // Any filter change goes back to the first page.
  const filter =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };

  return (
    <>
      <Typography.Title level={3}>Audit log</Typography.Title>
      <Space wrap style={{ marginBottom: 16 }}>
        <Select<AuditAction>
          allowClear
          placeholder="Action"
          style={{ width: 150 }}
          value={action}
          onChange={filter(setAction)}
          options={(["DISABLE", "REACTIVATE", "DELETE"] as const).map((a) => ({
            value: a,
            label: a,
          }))}
        />
        <DatePicker.RangePicker
          onChange={filter((d) =>
            setRange(
              d?.[0] && d[1]
                ? [
                    d[0].startOf("day").toISOString(),
                    d[1].endOf("day").toISOString(),
                  ]
                : undefined
            )
          )}
        />
        <Input
          allowClear
          placeholder="Admin ID"
          style={{ width: 300 }}
          value={adminId}
          onChange={(e) => filter(setAdminId)(e.target.value)}
        />
        <Input
          allowClear
          placeholder="Target user ID"
          style={{ width: 300 }}
          value={targetUserId}
          onChange={(e) => filter(setTargetUserId)(e.target.value)}
        />
      </Space>
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
