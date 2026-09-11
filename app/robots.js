import { SITE_URL } from '@/lib/site';

export default function robots() {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // The dashboard has nothing to index and shouldn't appear in search.
        // /blog/new and /blog/edit/ now redirect into it and stay listed so
        // anything that already crawled them stops.
        disallow: ['/api/', '/admin', '/blog/new', '/blog/edit/'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
