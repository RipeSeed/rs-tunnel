type WebEnv = {
  NODE_ENV: 'development' | 'test' | 'production';
  RS_TUNNEL_API_URL: string;
  ADMIN_SESSION_SECRET: string;
};

let cachedEnv: WebEnv | null = null;

function requireEnv(name: keyof WebEnv): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getWebEnv(): WebEnv {
  if (cachedEnv) {
    return cachedEnv;
  }

  cachedEnv = {
    NODE_ENV: (process.env.NODE_ENV as WebEnv['NODE_ENV'] | undefined) ?? 'development',
    RS_TUNNEL_API_URL: requireEnv('RS_TUNNEL_API_URL'),
    ADMIN_SESSION_SECRET: requireEnv('ADMIN_SESSION_SECRET'),
  };

  return cachedEnv;
}
