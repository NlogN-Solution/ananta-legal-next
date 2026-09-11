import { redirect } from 'next/navigation';

/* Editing moved into the dashboard; the old URL forwards to it. */
export default async function Page({ params }) {
  const { slug } = await params;
  redirect(`/admin/blog/${slug}`);
}
