import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';

import { useAuth } from '@/features/auth/auth-context';
import { StepBrandDna } from '@/features/onboarding/step-brand-dna';
import { StepImport } from '@/features/onboarding/step-import';
import { FlowHeader } from '@/features/orgs/flow-header';
import { createOrganization } from '@/features/orgs/orgs-api';
import { errorMessage } from '@/lib/api';
import { type BrandData, emptyBrand } from '@/lib/types';

/** A new organization: import a website (or start blank), review the brand, create. It becomes the current one. */
export default function NewOrganizationScreen() {
  const queryClient = useQueryClient();
  const { refreshUser } = useAuth();
  const [step, setStep] = useState<'import' | 'dna'>('import');
  const [brand, setBrand] = useState<BrandData>(emptyBrand);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const create = async () => {
    if (!brand.businessName.trim()) {
      setError('Give the organization a name.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await createOrganization(brand);
      // The server switches to the new organization; everything cached belongs to the old one.
      queryClient.clear();
      await refreshUser();
      router.dismissTo('/more');
    } catch (caught) {
      setError(errorMessage(caught));
      setSaving(false);
    }
  };

  if (step === 'import') {
    return (
      <StepImport
        header={<FlowHeader title='New organization' onBack={() => router.back()} />}
        onComplete={(imported) => {
          setBrand(imported);
          setStep('dna');
        }}
        onSkip={() => setStep('dna')}
        skipping={false}
        skipError=''
      />
    );
  }

  return (
    <StepBrandDna
      header={<FlowHeader title='New organization' onBack={() => setStep('import')} />}
      brand={brand}
      onChange={(patch) => setBrand((previous) => ({ ...previous, ...patch }))}
      onContinue={create}
      onBack={() => setStep('import')}
      saving={saving}
      error={error}
    />
  );
}
