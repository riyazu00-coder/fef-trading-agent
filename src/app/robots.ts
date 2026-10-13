import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: [
          '/',
          '/about',
          '/agents',
          '/how-to-use',
          '/community',
          '/markets',
          '/markets/*',
          '/chart-analyzer',
        ],
        disallow: [
          '/api/',
          '/member/',
          '/admin/',
          '/settings',
          '/journal',
          '/execution',
          '/tradingview',
        ],
      },
    ],
    sitemap: 'https://app.feftradingsolutions.com/sitemap.xml',
    host: 'https://app.feftradingsolutions.com',
  };
}
