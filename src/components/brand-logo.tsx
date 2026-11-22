import { SvgXml } from 'react-native-svg';

import { platformMeta } from '@/lib/platforms';
import { useColors } from '@/lib/theme';

import { BRAND_SVGS } from './brand-svgs';
import { Icon } from './icon';

/** Other names the server uses for the same platform. */
const ALIASES: Record<string, string> = {
  twitter: 'x',
  googlecalendar: 'google_calendar',
  googledrive: 'google_drive',
  googlemeet: 'google_meet',
  googlesheets: 'google_sheets',
  googleslides: 'google_slides',
  googledocs: 'google_docs',
  googleforms: 'google_forms',
  microsoft_outlook: 'outlook',
  email: 'gmail',
};

export function hasBrandLogo(platform?: string | null) {
  const key = platform ? (ALIASES[platform] ?? platform) : '';
  return !!BRAND_SVGS[key];
}

/** A platform's official full-color logo, falling back to its outline icon. */
export function BrandLogo({ platform, size = 24 }: { platform?: string | null; size?: number }) {
  const colors = useColors();
  const key = platform ? (ALIASES[platform] ?? platform) : '';
  const svg = BRAND_SVGS[key];
  if (svg) return <SvgXml xml={svg} width={size} height={size} accessibilityLabel={`${platformMeta(key).label} logo`} />;
  const meta = platformMeta(platform);
  return <Icon name={meta.icon} size={size} color={meta.color ?? colors.text} />;
}
