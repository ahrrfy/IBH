/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  i18n: { locales: ['ar', 'en'], defaultLocale: 'ar' },
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
