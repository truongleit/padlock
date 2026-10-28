import { Logger } from "@nestjs/common";

// Error-path tests log on purpose; keep the test output readable.
Logger.overrideLogger(false);
