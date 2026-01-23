import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/dashboard', '/account', '/auth/signin', '/auth/signup'],
      },
    ],
    sitemap: 'https://nexusmeme.com/sitemap.xml',
  };
}
