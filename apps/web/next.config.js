/** @type {import('next').NextConfig} */
const isWindows = process.platform === 'win32';
const nextConfig = {
  reactStrictMode: true,
  ...(isWindows ? {} : { output: 'standalone' }),
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: (process.env.API_BASE_URL || 'http://localhost:3000') + '/:path*',
      },
    ];
  },
};
module.exports = nextConfig;
