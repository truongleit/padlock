import "reflect-metadata";

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import helmet from "helmet";

import { AppModule } from "@/app.module";
import { validationExceptionFactory } from "@/common/errors/validation";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: config.getOrThrow<string>("ADMIN_WEB_ORIGIN"),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: validationExceptionFactory,
    })
  );
  app.enableShutdownHooks();

  const doc = new DocumentBuilder()
    .setTitle("Padlock API")
    .setVersion("0.1")
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, doc);
  SwaggerModule.setup("docs", app, document);

  if (config.get<string>("NODE_ENV") !== "production") {
    const swaggerPath = fileURLToPath(
      new URL("../../../docs/swagger.json", import.meta.url)
    );
    mkdirSync(dirname(swaggerPath), { recursive: true });
    writeFileSync(swaggerPath, `${JSON.stringify(document, null, 2)}\n`);
  }

  await app.listen(config.get<number>("PORT") ?? 3000);
}

void bootstrap();
