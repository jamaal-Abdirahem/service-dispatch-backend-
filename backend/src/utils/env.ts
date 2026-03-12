// NOTE: dotenv.config() is called once at the top of index.ts before this module
// is imported. Do NOT call it again here.

export const validateEnv = () => {
  const required = ['DATABASE_URL', 'JWT_SECRET', 'FRONTEND_URL'];
  const missing = required.filter((v) => !process.env[v]);

  if (missing.length > 0) {
    console.error(`[env] FATAL — Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }

  // Default NODE_ENV to 'development' so downstream code never reads undefined
  if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = 'development';
    console.warn('[env] NODE_ENV not set — defaulting to "development"');
  }

  // Default BCRYPT_ROUNDS if not supplied (10 for dev, recommend 12 for prod)
  if (!process.env.BCRYPT_ROUNDS) {
    process.env.BCRYPT_ROUNDS = '10';
  }

  console.log(`[env] Validated. NODE_ENV=${process.env.NODE_ENV}`);
};
