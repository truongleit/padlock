import {
  DashboardOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from "@ant-design/icons";
import { Button, Grid, Layout, Menu, Typography, theme } from "antd";
import { useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";

import { UserMenu } from "@/components/layouts/UserMenu";

const navItems = [
  { key: "/", label: "Dashboard", icon: <DashboardOutlined /> },
];

export function CmsLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { token } = theme.useToken();
  const isMobile = !Grid.useBreakpoint().lg;

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Layout.Sider
        breakpoint="lg"
        collapsedWidth={0}
        collapsed={collapsed}
        onCollapse={setCollapsed}
        trigger={null}
        width={220}
        theme="light"
        style={{ borderRight: `1px solid ${token.colorBorderSecondary}` }}
      >
        <Typography.Title level={4} style={{ margin: 0, padding: "16px 24px" }}>
          Padlock
        </Typography.Title>
        <Menu
          mode="inline"
          items={navItems}
          selectedKeys={[pathname]}
          style={{ borderInlineEnd: 0 }}
          onClick={({ key }) => {
            navigate(key);
            if (isMobile) setCollapsed(true);
          }}
        />
      </Layout.Sider>
      <Layout>
        <Layout.Header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 16px",
            background: token.colorBgContainer,
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          <Button
            type="text"
            aria-label="Toggle navigation"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed((c) => !c)}
          />
          <UserMenu />
        </Layout.Header>
        <Layout.Content style={{ padding: 24 }}>
          <Outlet />
        </Layout.Content>
      </Layout>
    </Layout>
  );
}
