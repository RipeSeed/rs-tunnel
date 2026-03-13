import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@ripeseed/shared'],
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    externalDir: true,
  },
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
};

export default nextConfig;
