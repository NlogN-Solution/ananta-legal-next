import { listPosts, toPublicPost } from '@/server-lib/posts-repo';
import { SITE_NAME, absoluteUrl } from '@/lib/site';
import BlogListView from '@/views/BlogListView';

/* Server component so the post links are in the initial HTML for crawlers. */
export const revalidate = 300;

const TITLE = 'Blog — legal insights for founders';
const DESCRIPTION =
  'Plain-English guides, teardowns and checklists on company formation, contracts, fundraising, IP and compliance in Nepal.';

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: absoluteUrl('/blog') },
  openGraph: {
    type: 'website',
    title: TITLE,
    description: DESCRIPTION,
    url: absoluteUrl('/blog'),
    siteName: SITE_NAME,
  },
  twitter: { card: 'summary', title: TITLE, description: DESCRIPTION },
};

export default async function BlogRoute() {
  const posts = await listPosts();
  return <BlogListView posts={posts.map(toPublicPost)} />;
}
