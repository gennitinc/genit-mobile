import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Banner, Button, Field, Heading, Screen } from '@/components/ui';
import { radius, space } from '@/lib/theme';
import type { BrandData, SocialPlatform } from '@/lib/types';

import { Card, ColorEditor, FontPicker, LogoPicker, SocialField, SOCIALS, TagEditor } from './brand-fields';

type Props = {
  header: ReactNode;
  brand: BrandData;
  onChange: (patch: Partial<BrandData>) => void;
  onContinue: () => void;
  onBack: () => void;
  saving: boolean;
  error: string;
};

export function StepBrandDna({ header, brand, onChange, onContinue, onBack, saving, error }: Props) {
  const colors = brand.brandColors.length
    ? brand.brandColors
    : [brand.primaryColor, brand.secondaryColor].filter(Boolean);

  return (
    <Screen
      header={header}
      footer={
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Button title='Back' variant='ghost' flex disabled={saving} onPress={onBack} />
          <Button title='Save & continue' flex loading={saving} onPress={onContinue} />
        </View>
      }
    >
      <Heading title='Your brand, distilled' subtitle="Review and tweak anything that doesn't feel right." />
      <Banner message={error} />

      <Card title='Brand'>
        <LogoPicker uri={brand.brandLogo} onUploaded={(brandLogo) => onChange({ brandLogo })} />
        <Field
          value={brand.businessName}
          onChangeText={(businessName) => onChange({ businessName })}
          placeholder='Brand name'
          autoCapitalize='words'
        />
        <Field
          value={brand.companyWebsite}
          onChangeText={(companyWebsite) => onChange({ companyWebsite })}
          placeholder='https://yoursite.com'
          keyboardType='url'
          autoCapitalize='none'
          autoCorrect={false}
        />
        <Field
          value={brand.businessBio}
          onChangeText={(businessBio) => onChange({ businessBio })}
          placeholder='One-line description'
          multiline
        />
      </Card>

      {brand.screenshot ? (
        <Card title='Source preview'>
          <Image
            source={{ uri: brand.screenshot }}
            contentFit='cover'
            contentPosition='top'
            style={{ height: 180, borderRadius: radius.md }}
            accessibilityLabel='Screenshot of your site'
          />
        </Card>
      ) : null}

      <Card title='Colors'>
        <ColorEditor
          values={colors}
          onChange={(next) =>
            onChange({ brandColors: next, primaryColor: next[0] ?? '', secondaryColor: next[1] ?? '' })
          }
        />
      </Card>

      <Card title='Fonts'>
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <FontPicker label='Headline' value={brand.fontHeadline} onChange={(fontHeadline) => onChange({ fontHeadline })} />
          <FontPicker label='Body' value={brand.fontBody} onChange={(fontBody) => onChange({ fontBody })} />
        </View>
      </Card>

      <Card title='About us'>
        <Field
          value={brand.aboutUs}
          onChangeText={(aboutUs) => onChange({ aboutUs })}
          placeholder='What does your brand do, and for whom?'
          multiline
        />
      </Card>

      <Card title='Mission'>
        <Field
          value={brand.mission}
          onChangeText={(mission) => onChange({ mission })}
          placeholder='One sentence: what you do, now.'
          multiline
        />
      </Card>

      <Card title='Vision'>
        <Field
          value={brand.vision}
          onChangeText={(vision) => onChange({ vision })}
          placeholder="One sentence: where you're going."
          multiline
        />
      </Card>

      <Card title='Slogan'>
        <Field value={brand.slogan} onChangeText={(slogan) => onChange({ slogan })} placeholder='A short tagline' />
      </Card>

      <Card title='Values'>
        <TagEditor
          values={brand.values}
          onChange={(values) => onChange({ values })}
          placeholder='Add a value (e.g. Integrity)'
        />
      </Card>

      <Card title='Voice tone'>
        <TagEditor
          values={brand.voiceTone}
          onChange={(voiceTone) => onChange({ voiceTone })}
          placeholder='Add a tone word'
          max={5}
        />
      </Card>

      <Card title='Social profiles'>
        {(Object.keys(SOCIALS) as SocialPlatform[]).map((platform) => (
          <SocialField
            key={platform}
            platform={platform}
            value={brand.socials[platform] ?? ''}
            onChange={(url) => onChange({ socials: { ...brand.socials, [platform]: url } })}
          />
        ))}
      </Card>
    </Screen>
  );
}
