'use client';

import { useParams } from 'next/navigation';
import { OrgProfileView } from '../../org-profile-view';

export default function InvestorProfilePage() {
  const params = useParams<{ id: string }>();
  return <OrgProfileView orgId={params.id} kind="company" />;
}
