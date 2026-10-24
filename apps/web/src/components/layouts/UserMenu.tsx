import { LogoutOutlined } from "@ant-design/icons";
import { Avatar, Dropdown, Grid, Space, Typography } from "antd";
import { useNavigate } from "react-router";

import { useLogout, useSession } from "@/features/auth/hooks";

export function UserMenu() {
  const navigate = useNavigate();
  const { mutate: logout } = useLogout();
  const label = useSession().data?.email ?? "Admin";
  const showName = Grid.useBreakpoint().md;

  return (
    <Dropdown
      placement="bottomRight"
      trigger={["hover"]}
      menu={{
        items: [
          {
            key: "logout",
            label: "Log out",
            icon: <LogoutOutlined />,
            danger: true,
            onClick: () =>
              logout(undefined, { onSettled: () => navigate("/login") }),
          },
        ],
      }}
    >
      <Space style={{ cursor: "pointer" }}>
        <Avatar style={{ background: "#1677ff" }}>
          {label.charAt(0).toUpperCase()}
        </Avatar>
        {showName && <Typography.Text>{label}</Typography.Text>}
      </Space>
    </Dropdown>
  );
}
