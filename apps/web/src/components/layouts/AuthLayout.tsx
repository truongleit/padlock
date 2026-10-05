import { Card, Flex, Typography, theme } from "antd";
import { Outlet } from "react-router";

export function AuthLayout() {
  const { token } = theme.useToken();

  return (
    <Flex
      align="center"
      justify="center"
      style={{
        minHeight: "100vh",
        background: token.colorBgLayout,
      }}
    >
      <Card
        style={{
          width: "100%",
          maxWidth: 400,
          boxShadow: token.boxShadowSecondary,
        }}
      >
        <Typography.Title level={3} style={{ textAlign: "center" }}>
          Padlock
        </Typography.Title>
        <Outlet />
      </Card>
    </Flex>
  );
}
