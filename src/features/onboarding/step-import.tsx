import { Ionicons } from '@expo/vector-icons';
import { type ReactNode, useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { Banner, Button, Divider, Field, Heading, Screen } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { space, useColors } from '@/lib/theme';
import { type BrandData, emptyBrand, type SocialPlatform, type SocialUrls } from '@/lib/types';

import { Card, LogoPicker, SocialField, SOCIALS } from './brand-fields';
import { importBrand } from './onboarding-api';

type Props = {
  header: ReactNode;
  onComplete: (brand: BrandData) => void;
  onSkip: () => void;
  skipping: boolean;
  skipError: string;
};

const LOADING_MESSAGES = [
  'Fetching your site…',
  'Taking a screenshot…',
  'Reading meta tags…',
  'Visiting your about and pricing pages…',
  'Extracting your brand colors…',
  'Pulling fonts and tone of voice…',
  'Drafting your brand DNA with AI…',
  'Almost ready…',
];

const MANUAL_SOCIALS: SocialPlatform[] = ['facebook', 'instagram', 'linkedin', 'youtube', 'twitter'];

export function StepImport({ header, onComplete, onSkip, skipping, skipError }: Props) {
  const colors = useColors();
  const [mode, setMode] = useState<'import' | 'importing' | 'manual'>('import');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  const handleImport = async () => {
    if (!url.trim()) return;
    setError('');
    setMode('importing');
    try {
      onComplete(await importBrand(url.trim()));
    } catch (caught) {
      setError(errorMessage(caught));
      setMode('import');
    }
  };

  if (mode === 'importing') return <Importing header={header} />;
  if (mode === 'manual') {
    return <ManualSetup header={header} onComplete={onComplete} onBack={() => setMode('import')} />;
  }

  return (
    <Screen header={header}>
      <Heading
        title="Let's import your brand"
        subtitle="Paste a website or social profile. We'll sample your colors and draft your brand DNA in seconds."
      />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: space.sm }}>
        <Ionicons name='globe-outline' size={26} color={colors.text} />
        {(['facebook', 'instagram', 'linkedin', 'youtube', 'twitter'] as const).map((platform) => (
          <Ionicons
            key={platform}
            name={SOCIALS[platform].icon}
            size={26}
            color={SOCIALS[platform].color ?? colors.text}
          />
        ))}
      </View>
      <Banner message={error || skipError} />
      <Field
        value={url}
        onChangeText={setUrl}
        placeholder='yoursite.com or instagram.com/you'
        accessibilityLabel='Website or social link'
        keyboardType='url'
        autoCapitalize='none'
        autoCorrect={false}
        returnKeyType='go'
        onSubmitEditing={handleImport}
        leading={<Ionicons name='link-outline' size={20} color={colors.textMuted} />}
      />
      <Button title='Import brand' disabled={!url.trim()} onPress={handleImport} />
      <Divider label='or' />
      <Button
        title='Add brand manually'
        variant='secondary'
        onPress={() => setMode('manual')}
        icon={<Ionicons name='add' size={20} color={colors.text} />}
      />
      <Button title='Skip for now' variant='ghost' loading={skipping} onPress={onSkip} />
    </Screen>
  );
}

function Importing({ header }: { header: ReactNode }) {
  const colors = useColors();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(
      () => setIndex((value) => Math.min(value + 1, LOADING_MESSAGES.length - 1)),
      3500
    );
    return () => clearInterval(timer);
  }, []);

  return (
    <Screen header={header} centered>
      <View style={{ alignItems: 'center', gap: space.lg }}>
        <ActivityIndicator size='large' color={colors.primary} />
        <Text style={{ fontSize: 24, fontWeight: '700', color: colors.text }}>Reading your brand</Text>
        <Text accessibilityLiveRegion='polite' style={{ fontSize: 15, textAlign: 'center', color: colors.textMuted }}>
          {LOADING_MESSAGES[index]}
        </Text>
      </View>
    </Screen>
  );
}

function ManualSetup({
  header,
  onComplete,
  onBack,
}: {
  header: ReactNode;
  onComplete: (brand: BrandData) => void;
  onBack: () => void;
}) {
  const colors = useColors();
  const [logo, setLogo] = useState('');
  const [name, setName] = useState('');
  const [website, setWebsite] = useState('');
  const [socials, setSocials] = useState<SocialUrls>({});
  const [error, setError] = useState('');

  const handleContinue = () => {
    if (!name.trim()) {
      setError('Add a business name to continue.');
      return;
    }
    const cleaned: SocialUrls = {};
    for (const platform of MANUAL_SOCIALS) {
      const value = socials[platform]?.trim();
      if (value) cleaned[platform] = value;
    }
    if (!website.trim() && !Object.keys(cleaned).length) {
      setError('Add a website or at least one social profile so we know where to find you.');
      return;
    }
    onComplete({
      ...emptyBrand,
      businessName: name.trim(),
      companyWebsite: website.trim(),
      brandLogo: logo,
      socials: cleaned,
    });
  };

  return (
    <Screen
      header={header}
      footer={
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Button title='Back' variant='ghost' flex onPress={onBack} />
          <Button title='Continue' flex onPress={handleContinue} />
        </View>
      }
    >
      <Heading title='Tell us about your brand' subtitle='No website yet? No problem, just add your socials.' />
      <Banner message={error} />
      <LogoPicker uri={logo} onUploaded={setLogo} />
      <Field label='Business name' value={name} onChangeText={setName} placeholder='Your brand name' autoCapitalize='words' />
      <Field
        label='Website (optional)'
        value={website}
        onChangeText={setWebsite}
        placeholder='https://'
        keyboardType='url'
        autoCapitalize='none'
        autoCorrect={false}
        leading={<Ionicons name='globe-outline' size={18} color={colors.textMuted} />}
      />
      <Card title='Social profiles'>
        {MANUAL_SOCIALS.map((platform) => (
          <SocialField
            key={platform}
            platform={platform}
            value={socials[platform] ?? ''}
            onChange={(value) => setSocials((previous) => ({ ...previous, [platform]: value }))}
          />
        ))}
      </Card>
    </Screen>
  );
}
