import { router } from 'expo-router';
import { useState } from 'react';

import { useAuth } from '@/features/auth/auth-context';
import { StepBrandDna } from '@/features/onboarding/step-brand-dna';
import { FlowHeader } from '@/features/orgs/flow-header';
import { brandFromOrganization, currentOrganization, updateOrganization } from '@/features/orgs/orgs-api';
import { errorMessage } from '@/lib/api';
import { type BrandData, emptyBrand } from '@/lib/types';

/** Edits the current organization's brand: what Genit applies when brand identity is on. */
export default function BrandScreen() {
  const { user, refreshUser } = useAuth();
  const org = currentOrganization(user);
  const [brand, setBrand] = useState<BrandData>(() => (org ? brandFromOrganization(org) : emptyBrand));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!org) return;
    setSaving(true);
    setError('');
    try {
      await updateOrganization(org._id, brand);
      await refreshUser();
      router.back();
    } catch (caught) {
      setError(errorMessage(caught));
      setSaving(false);
    }
  };

  return (
    <StepBrandDna
      header={<FlowHeader title='Brand identity' onBack={() => router.back()} />}
      brand={brand}
      onChange={(patch) => setBrand((previous) => ({ ...previous, ...patch }))}
      onContinue={save}
      onBack={() => router.back()}
      saving={saving}
      error={error || (org ? '' : 'Choose an organization first.')}
    />
  );
}
