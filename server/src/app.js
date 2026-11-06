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
import { requestLogger } from './middleware/requestLogger.js';
import { notFoundHandler } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';

export function createApp({ db, config, logger, gamificationHandler } = {}) {
  if (!db) throw new Error('createApp requires a database connection.');
  const env = config ?? loadEnv();
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: env.clientOrigin, credentials: true }));
  app.use(cookieParser());
  app.use(express.json({ limit: '10kb' }));
  app.use(requestLogger(logger));
  app.use('/api', createHealthRoutes(db));
  app.use('/api/auth', createAuthRoutes({ db, env, rateLimits: env.authRateLimits }));
  const apiOptions = { db, env, logger, eventHandler: gamificationHandler };
  app.use('/api/categories', createCategoryRoutes(apiOptions));
  app.use('/api/transactions', createTransactionRoutes(apiOptions));
  app.use('/api/budgets', createBudgetRoutes(apiOptions));
  app.use('/api/dashboard', createDashboardRoutes(apiOptions));
  app.use('/api/analytics', createAnalyticsRoutes(apiOptions));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
