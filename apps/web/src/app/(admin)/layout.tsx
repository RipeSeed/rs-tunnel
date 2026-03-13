import { AdminShell } from '../../components/admin-shell';
import { requireProtectedAdminState } from '../../lib/auth';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const state = await requireProtectedAdminState();

  return <AdminShell userEmail={state.adminSession.user.email}>{children}</AdminShell>;
}
