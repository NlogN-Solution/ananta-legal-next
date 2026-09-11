import { redirect } from 'next/navigation';

/* Writing moved into the dashboard, where it sits alongside pages, media and
   the account. The old URL still works so nothing bookmarked breaks. */
export default function Page() {
  redirect('/admin/blog/new');
}
