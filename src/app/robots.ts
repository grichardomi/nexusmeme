import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/dashboard', '/account', '/admin', '/api'],
      },
    ],
    sitemap: 'https://nexusmeme.com/sitemap.xml',
  };
}
