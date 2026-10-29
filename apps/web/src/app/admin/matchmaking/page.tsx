'use client';

import { PageHeader } from '@/components/page-header';
import { TagMappingsPanel } from '@/components/tag-mappings-panel';

export default function MatchmakingPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Match & meet"
        title="Matchmaking"
        description="Link related filter tags so client and guest recommendations cross-match. Example: Food ↔ Hotel."
      />
      <TagMappingsPanel />
    </div>
  );
}
