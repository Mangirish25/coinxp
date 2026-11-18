import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { loadEnv } from './config/env.js';
import { createHealthRoutes } from './routes/healthRoutes.js';
import { createAuthRoutes } from './routes/authRoutes.js';
import { createCategoryRoutes } from './routes/categoryRoutes.js';
import { createTransactionRoutes } from './routes/transactionRoutes.js';
import { createBudgetRoutes } from './routes/budgetRoutes.js';
import { createDashboardRoutes } from './routes/dashboardRoutes.js';
import { createAnalyticsRoutes } from './routes/analyticsRoutes.js';
import { createGamificationRoutes } from './routes/gamificationRoutes.js';
import { createGamificationEngine } from './gamification/engine.js';
import { createStreakAdvancer } from './gamification/streaks/advance.js';
import { createStreakRoutes } from './routes/streakRoutes.js';
import { createIntegrityRoutes } from './routes/integrityRoutes.js';
import { createBadgeRoutes } from './routes/badgeRoutes.js';
import { createMissionRoutes } from './routes/missionRoutes.js';
import { createShopRoutes } from './routes/shopRoutes.js';
import { createChallengeRoutes } from './routes/challengeRoutes.js';
import { createProfileRoutes } from './routes/profileRoutes.js';
import { createActivityRoutes } from './routes/activityRoutes.js';
import { createNotificationPreferenceRoutes } from './routes/notificationPreferenceRoutes.js';
import { createCelebrationRoutes } from './routes/celebrationRoutes.js';
import { createUiPreferenceRoutes } from './routes/uiPreferenceRoutes.js';
import { createAccountRoutes } from './routes/accountRoutes.js';
import { requestLogger } from './middleware/requestLogger.js';
import { notFoundHandler } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';
import { originGuard } from './middleware/originGuard.js';
import { createTestClockRoutes } from './routes/testClockRoutes.js';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function createApp({ db, config, logger, gamificationHandler, clock } = {}) {
  if (!db) throw new Error('createApp requires a database connection.');
  const env = config ?? loadEnv();
  if (env.nodeEnv === 'production' && env.enableTestClock) throw new Error('ENABLE_TEST_CLOCK cannot be enabled in production.');
  const app = express();
  app.disable('x-powered-by');
  if (env.trustProxy !== undefined) app.set('trust proxy', env.trustProxy);
  const gameEngine = createGamificationEngine({ db, logger, clock, enabled: env.gamificationEnabled !== false });
  const streakService = createStreakAdvancer({ db, gameEngine, config: undefined, clock, logger });
  app.locals.gameEngine = gameEngine;
  app.locals.streakService = streakService;
  app.use(helmet(env.nodeEnv === 'production' ? {
    contentSecurityPolicy: { directives: {
      defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrcElem: ["'self'"], styleSrcAttr: ["'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'], connectSrc: ["'self'"], fontSrc: ["'self'"], frameAncestors: ["'none'"],
      baseUri: ["'none'"], formAction: ["'self'"],
    } },
    referrerPolicy: { policy: 'same-origin' },
    permissionsPolicy: { features: { accelerometer: [], camera: [], geolocation: [], gyroscope: [], magnetometer: [] } },
  } : undefined));
  if (env.nodeEnv !== 'production') app.use(cors({ origin: env.clientOrigin, credentials: true }));
  app.use(cookieParser());
  app.use(originGuard({ enabled: env.nodeEnv === 'production', origin: env.publicOrigin ?? env.clientOrigin }));
  app.use((req, res, next) => express.json({ limit: req.path.startsWith('/api/auth') ? '10kb' : '100kb' })(req, res, next));
  app.use(requestLogger(logger));
  app.locals.scheduler = null;
  app.use('/api', createHealthRoutes(db, gameEngine, { env, getScheduler: () => app.locals.scheduler }));
  app.use('/api/auth', createAuthRoutes({ db, env, rateLimits: env.authRateLimits, gameEngine }));
  const apiOptions = { db, env, logger, eventHandler: gamificationHandler, gameEngine };
  app.use('/api/categories', createCategoryRoutes(apiOptions));
  app.use('/api/transactions', createTransactionRoutes(apiOptions));
  app.use('/api/budgets', createBudgetRoutes(apiOptions));
  app.use('/api/dashboard', createDashboardRoutes(apiOptions));
  app.use('/api/analytics', createAnalyticsRoutes(apiOptions));
  app.use('/api/gamification', createGamificationRoutes(apiOptions));
  app.use('/api/streaks', createStreakRoutes({ db, env, streakService }));
  app.use('/api/integrity', createIntegrityRoutes({ db, env, clock: gameEngine.clock }));
  app.use('/api/badges', createBadgeRoutes({ db, env, gameEngine }));
  app.use('/api/missions', createMissionRoutes({ db, env, gameEngine }));
  app.use('/api/shop', createShopRoutes({ db, env, gameEngine, streakService }));
  app.use('/api/challenges', createChallengeRoutes({ db, env, gameEngine }));
  app.use('/api/profile', createProfileRoutes({ db, env, gameEngine, streakService }));
  app.use('/api/activity', createActivityRoutes({ db, env }));
  app.use('/api/notifications', createNotificationPreferenceRoutes({ db, env, clock: gameEngine.clock }));
  app.use('/api/celebrations', createCelebrationRoutes({ db, env, clock: gameEngine.clock }));
  app.use('/api/ui/preferences', createUiPreferenceRoutes({ db, env, clock: gameEngine.clock }));
  app.use('/api/account', createAccountRoutes({ db, env, clock: gameEngine.clock }));
  if (env.nodeEnv === 'test' && env.enableTestClock && clock?.set && clock?.advance) {
    app.use('/api/test/clock', createTestClockRoutes(clock));
  }
  if (env.nodeEnv === 'production') {
    const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
    const clientBuild = path.join(repositoryRoot, 'client', 'dist');
    if (existsSync(clientBuild)) {
      app.use(express.static(clientBuild, { index: false, immutable: true, maxAge: '1y', setHeaders(res, filePath) {
        if (path.basename(filePath) === 'index.html') res.setHeader('Cache-Control', 'no-cache');
      } }));
      app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api/')) return next();
        res.setHeader('Cache-Control', 'no-cache');
        res.sendFile(path.join(clientBuild, 'index.html'));
      });
    }
  }
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
