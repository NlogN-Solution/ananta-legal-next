import AdminShell from '@/views/admin/AdminShell';

/* The dashboard is for one person and must never be indexed. */
export const metadata = {
  title: 'Dashboard — Ananta Legal',
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminLayout({ children }) {
  return <AdminShell>{children}</AdminShell>;
}
