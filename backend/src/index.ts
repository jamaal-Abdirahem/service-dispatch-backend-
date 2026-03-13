// IMPORTANT: dotenv.config() MUST be the very first call so that
// process.env variables are available when all other modules are imported.
import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';

import { validateEnv } from './utils/env';
import { errorHandler } from './middleware/error.middleware';
import prisma from './utils/prisma';

// Routes
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import requestRoutes from './routes/request.routes';

// Assert required environment variables exist before anything else runs
validateEnv();

const app = express();
const PORT = process.env.PORT || 5000;
const isProduction = process.env.NODE_ENV === 'production';

// ── Security Middlewares ──────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  credentials: true,
}));

// Body parser — 10kb limit prevents large-body DoS attacks
app.use(express.json({ limit: '10kb' }));

// ── HTTP Request Logger ───────────────────────────────────────────────────────
// 'combined' in production (Apache-style, good for log aggregators)
// 'dev' in development (coloured, concise)
app.use(morgan(isProduction ? 'combined' : 'dev'));

// ── Rate Limiting ─────────────────────────────────────────────────────────────
// Disabled to allow unlimited requests during development/testing
/*
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
});

// Tighter limiter on auth routes — prevent brute-force attacks
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20, // max 20 login/register attempts per 15 min per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many auth attempts, please try again later.' },
});

app.use('/api', limiter);
*/

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/requests', requestRoutes);

// ── 404 Catch-all ─────────────────────────────────────────────────────────────
app.use('*', (_req: Request, res: Response) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// ── Global Error Handler ──────────────────────────────────────────────────────
app.use(errorHandler);

// ── Start Server ──────────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`[server] Running on port ${PORT} in ${process.env.NODE_ENV} mode`);
});

// ── Graceful Shutdown ─────────────────────────────────────────────────────────
const shutdown = async (signal: string) => {
  console.log(`[server] ${signal} received — shutting down gracefully...`);

  // Force exit after 10 seconds if shutdown hangs (e.g. DB connection stuck)
  const forceExit = setTimeout(() => {
    console.error('[server] Force-exiting after 10s shutdown timeout.');
    process.exit(1);
  }, 10_000);
  forceExit.unref(); // don't let this timer keep the event loop alive

  server.close(async () => {
    console.log('[server] HTTP server closed.');
    await prisma.$disconnect();
    console.log('[server] Database connection closed.');
    clearTimeout(forceExit);
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ── Safety Net: catch any unhandled async errors ───────────────────────────────
process.on('unhandledRejection', (reason: unknown) => {
  console.error('[server] Unhandled Promise Rejection:', reason);
  // Graceful shutdown — don't leave the process in an undefined state
  shutdown('unhandledRejection');
});

process.on('uncaughtException', (err: Error) => {
  console.error('[server] Uncaught Exception:', err.message, err.stack);
  shutdown('uncaughtException');
});
