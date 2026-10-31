'use client';

import { useParams } from 'next/navigation';
import { OrgProfileView } from '../../org-profile-view';

export default function InnovatorProfilePage() {
  const params = useParams<{ id: string }>();
  return <OrgProfileView orgId={params.id} kind="vendor" />;
}
