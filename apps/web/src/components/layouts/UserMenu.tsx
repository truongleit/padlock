import { LogoutOutlined } from "@ant-design/icons";
import { Avatar, Dropdown, Grid, Space, Typography } from "antd";
import { useNavigate } from "react-router";

// TODO: replace with the authenticated admin once auth is integrated.
const user = { email: "admin@padlock.local" };

export function UserMenu() {
  const navigate = useNavigate();
  const showName = Grid.useBreakpoint().md;

  return (
    <Dropdown
      placement="bottomRight"
      trigger={["hover"]}
      menu={{
        items: [
          { key: "email", label: user.email, disabled: true },
          { type: "divider" },
          {
            key: "logout",
            label: "Log out",
            icon: <LogoutOutlined />,
            danger: true,
            // TODO: call the logout endpoint once auth is integrated.
            onClick: () => navigate("/login"),
          },
        ],
      }}
    >
      <Space style={{ cursor: "pointer" }}>
        <Avatar style={{ background: "#1677ff" }}>
          {user.email.charAt(0).toUpperCase()}
        </Avatar>
        {showName && <Typography.Text>{user.email}</Typography.Text>}
      </Space>
    </Dropdown>
  );
}
