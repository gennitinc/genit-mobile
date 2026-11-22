import { Icon, type IconName } from '@/components/icon';
import { type ReactNode, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Banner, Button, Heading, Screen } from '@/components/ui';
import { radius, space, useColors } from '@/lib/theme';

type Option = { id: string; label: string; icon: IconName };

const ROLES: Option[] = [
  { id: 'founder', label: 'Founder', icon: 'rocket-outline' },
  { id: 'marketing', label: 'Marketing', icon: 'megaphone-outline' },
  { id: 'side-hustle', label: 'Side Hustle', icon: 'flash-outline' },
  { id: 'freelancer', label: 'Freelancer', icon: 'briefcase-outline' },
  { id: 'agency', label: 'Agency', icon: 'business-outline' },
  { id: 'sales', label: 'Sales', icon: 'trending-up-outline' },
  { id: 'developer', label: 'Developer', icon: 'code-slash-outline' },
  { id: 'designer', label: 'Designer', icon: 'color-palette-outline' },
  { id: 'other', label: 'Other', icon: 'ellipsis-horizontal' },
];

const HEAR_OPTIONS: Option[] = [
  { id: 'twitter', label: 'X (Twitter)', icon: 'logo-x' },
  { id: 'facebook', label: 'Facebook', icon: 'logo-facebook' },
  { id: 'linkedin', label: 'LinkedIn', icon: 'logo-linkedin' },
  { id: 'tiktok', label: 'TikTok', icon: 'logo-tiktok' },
  { id: 'google', label: 'Google', icon: 'logo-google' },
  { id: 'friend', label: 'Friend', icon: 'people-outline' },
  { id: 'youtube', label: 'YouTube', icon: 'logo-youtube' },
  { id: 'instagram', label: 'Instagram', icon: 'logo-instagram' },
  { id: 'other', label: 'Other', icon: 'ellipsis-horizontal' },
];

type Props = {
  header: ReactNode;
  initialRole: string;
  initialHear: string;
  onSubmit: (answers: { role: string; hearAboutUs: string }) => void;
  onBack: () => void;
  submitting: boolean;
  error: string;
};

export function StepQuestions({ header, initialRole, initialHear, onSubmit, onBack, submitting, error }: Props) {
  const [role, setRole] = useState(initialRole);
  const [hear, setHear] = useState(initialHear);

  return (
    <Screen
      header={header}
      footer={
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Button title='Back' variant='ghost' flex disabled={submitting} onPress={onBack} />
          <Button
            title='Finish'
            flex
            loading={submitting}
            disabled={!role || !hear}
            onPress={() => onSubmit({ role, hearAboutUs: hear })}
          />
        </View>
      }
    >
      <Heading title='Tell us a little about yourself' subtitle='This helps us tailor your experience.' />
      <Banner message={error} />
      <OptionGrid title='What best describes you?' options={ROLES} value={role} onChange={setRole} />
      <OptionGrid title='How did you find us?' options={HEAR_OPTIONS} value={hear} onChange={setHear} />
    </Screen>
  );
}

function OptionGrid({
  title,
  options,
  value,
  onChange,
}: {
  title: string;
  options: Option[];
  value: string;
  onChange: (value: string) => void;
}) {
  const colors = useColors();
  return (
    <View style={{ gap: space.md, marginTop: space.sm }}>
      <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>{title}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {options.map((option) => {
          const active = option.id === value;
          return (
            <Pressable
              key={option.id}
              accessibilityRole='radio'
              accessibilityState={{ selected: active }}
              onPress={() => onChange(option.id)}
              style={{
                flexBasis: '48%',
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.sm,
                minHeight: 48,
                paddingHorizontal: space.md,
                borderWidth: 1,
                borderRadius: radius.md,
                borderColor: active ? colors.primary : colors.border,
                backgroundColor: active ? colors.selected : colors.background,
              }}
            >
              <Icon name={option.icon} size={18} color={active ? colors.selectedText : colors.textMuted} />
              <Text style={{ fontSize: 14, fontWeight: active ? '600' : '400', color: active ? colors.selectedText : colors.text }}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
