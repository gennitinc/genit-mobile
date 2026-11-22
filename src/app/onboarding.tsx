import { useState } from 'react';
import { Text, View } from 'react-native';

import { Logo } from '@/components/ui';
import { onboardingRecord, useAuth } from '@/features/auth/auth-context';
import {
  brandFromRecord,
  saveOnboarding,
  stepFromRecord,
  stepNumber,
} from '@/features/onboarding/onboarding-api';
import { StepBrandDna } from '@/features/onboarding/step-brand-dna';
import { StepImport } from '@/features/onboarding/step-import';
import { StepQuestions } from '@/features/onboarding/step-questions';
import { errorMessage } from '@/lib/api';
import { radius, space, useColors } from '@/lib/theme';
import { type BrandData, emptyBrand, type OnboardingStep } from '@/lib/types';

export default function OnboardingScreen() {
  const { user, refreshUser } = useAuth();
  const record = onboardingRecord(user);
  const [step, setStep] = useState<OnboardingStep>(() => stepFromRecord(record));
  const [brand, setBrand] = useState<BrandData>(() => (record ? brandFromRecord(record) : emptyBrand));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const header = <OnboardingHeader step={step} />;

  const goTo = (next: OnboardingStep) => {
    setError('');
    setStep(next);
  };

  const handleImportComplete = (imported: BrandData) => {
    setBrand(imported);
    goTo('dna');
    // A failed save loses nothing: the data is still on screen and is saved again next step.
    saveOnboarding({ ...imported, onboardingStep: 'dna' }).catch(() => undefined);
  };

  const handleDnaContinue = async () => {
    setBusy(true);
    setError('');
    try {
      await saveOnboarding({ ...brand, onboardingStep: 'questions' });
      setStep('questions');
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  /** Saving a final state, then refreshing, lets the root guard open the app. */
  const finish = async (patch: Parameters<typeof saveOnboarding>[0]) => {
    setBusy(true);
    setError('');
    try {
      await saveOnboarding(patch);
      await refreshUser();
    } catch (caught) {
      setError(errorMessage(caught));
      setBusy(false);
    }
  };

  if (step === 'import') {
    return (
      <StepImport
        header={header}
        onComplete={handleImportComplete}
        onSkip={() => finish({ onboardingSkipped: true })}
        skipping={busy}
        skipError={error}
      />
    );
  }

  if (step === 'dna') {
    return (
      <StepBrandDna
        header={header}
        brand={brand}
        onChange={(patch) => setBrand((previous) => ({ ...previous, ...patch }))}
        onContinue={handleDnaContinue}
        onBack={() => goTo('import')}
        saving={busy}
        error={error}
      />
    );
  }

  return (
    <StepQuestions
      header={header}
      initialRole={brand.role}
      initialHear={brand.hearAboutUs}
      onSubmit={(answers) =>
        finish({ ...brand, ...answers, onboardingStep: 'questions', onboardingCompleted: true })
      }
      onBack={() => goTo('dna')}
      submitting={busy}
      error={error}
    />
  );
}

function OnboardingHeader({ step }: { step: OnboardingStep }) {
  const colors = useColors();
  const { current, total } = stepNumber(step);
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: space.page,
        paddingVertical: space.md,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Logo size={28} />
        <Text style={{ fontSize: 18, fontWeight: '600', color: colors.text }}>Genit</Text>
      </View>
      <View
        accessibilityLabel={`Step ${current} of ${total}`}
        style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, width: 140 }}
      >
        <View style={{ flex: 1, height: 6, overflow: 'hidden', borderRadius: radius.full, backgroundColor: colors.surfacePressed }}>
          <View style={{ width: `${(current / total) * 100}%`, height: '100%', backgroundColor: colors.primary }} />
        </View>
        <Text style={{ fontSize: 12, color: colors.textMuted }}>
          {current}/{total}
        </Text>
      </View>
    </View>
  );
}
