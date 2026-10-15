import { NestFactory } from '@nestjs/core';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import * as passport from 'passport';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ limit: '50mb', extended: true }));

  // Global role/permission guards run before controller JwtAuthGuard.
  // Populate req.user first when a bearer token or access cookie is present
  // so those guards can see the authenticated role.
  app.use(passport.initialize());
  app.use((req: any, res: any, next: any) => {
    const header = String(req.headers?.authorization || '');
    const cookie = String(req.headers?.cookie || '');
    if (!header.startsWith('Bearer ') && !cookie.includes('access_token=')) {
      return next();
    }
    passport.authenticate('jwt', { session: false }, (_err: unknown, user: unknown) => {
      if (user) req.user = user;
      next();
    })(req, res, next);
  });

  const origins = (process.env.CORS_ORIGINS || 'http://localhost:3000,http://192.168.1.109:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin) return callback(null, true);
      if (
        origins.includes(origin) ||
        /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/.test(origin)
      ) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true,
  });

  app.setGlobalPrefix('api/v1', {
    exclude: [
      { path: 'health', method: RequestMethod.ALL },
      { path: 'health/db', method: RequestMethod.ALL },
    ],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'change-me-in-production')) {
    throw new Error('JWT_SECRET must be set to a strong value in production');
  }

  const port = Number(process.env.PORT) || 3001;
  const host = process.env.HOST || '0.0.0.0';
  await app.listen(port, host);
  console.log(`V2 backend running on http://192.168.1.109:${port}/api/v1 (and http://localhost:${port}/api/v1)`);
}

bootstrap();
