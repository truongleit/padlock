import { Flex, Spin } from "antd";

export function FullPageSpin() {
  return (
    <Flex align="center" justify="center" style={{ minHeight: "100vh" }}>
      <Spin />
    </Flex>
  );
}
