module.exports = {
  reactStrictMode: true,
  swcMinify: true,
  distDir: process.env.NEXT_DIST_DIR || '.next',
  experimental: {
    outputFileTracingIncludes: {
      '/api/downloads/connector': ['./storage/binaries/**/*'],
    },
  },
  async rewrites() {
    return [
      {
        source: '/dashboard',
        destination: '/cockpit',
      },
      {
        source: '/dashboard/:path*',
        destination: '/:path*',
      },
    ];
  },
};

