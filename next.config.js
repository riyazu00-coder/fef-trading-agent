module.exports = {
  reactStrictMode: true,
  swcMinify: true,
  distDir: process.env.NEXT_DIST_DIR || '.next',
  experimental: {
    outputFileTracingIncludes: {
      '/api/downloads/connector': ['./storage/binaries/**/*', './mql5/Experts/**/*'],
      '/api/downloads/connector/route': ['./storage/binaries/**/*', './mql5/Experts/**/*'],
      'src/app/api/downloads/connector/route': ['./storage/binaries/**/*', './mql5/Experts/**/*'],
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

