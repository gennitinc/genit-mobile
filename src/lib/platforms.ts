import { type IconName } from '@/components/icon';


type PlatformMeta = { label: string; icon: IconName; color?: string };

/** Display names, icons and brand colors for every platform the server knows. */
const PLATFORMS: Record<string, PlatformMeta> = {
  facebook: { label: 'Facebook', icon: 'logo-facebook', color: '#0866FF' },
  instagram: { label: 'Instagram', icon: 'logo-instagram', color: '#E4405F' },
  threads: { label: 'Threads', icon: 'at' },
  linkedin: { label: 'LinkedIn', icon: 'logo-linkedin', color: '#0A66C2' },
  x: { label: 'X', icon: 'logo-x' },
  twitter: { label: 'X', icon: 'logo-x' },
  tiktok: { label: 'TikTok', icon: 'logo-tiktok' },
  youtube: { label: 'YouTube', icon: 'logo-youtube', color: '#FF0000' },
  pinterest: { label: 'Pinterest', icon: 'logo-pinterest', color: '#E60023' },
  snapchat: { label: 'Snapchat', icon: 'logo-snapchat', color: '#F7C500' },
  gmail: { label: 'Gmail', icon: 'mail', color: '#EA4335' },
  email: { label: 'Email', icon: 'mail' },
  outlook: { label: 'Outlook', icon: 'mail', color: '#0078D4' },
  whatsapp: { label: 'WhatsApp', icon: 'logo-whatsapp', color: '#25D366' },
  messenger: { label: 'Messenger', icon: 'chatbubble-ellipses', color: '#0866FF' },
  telegram: { label: 'Telegram', icon: 'paper-plane', color: '#26A5E4' },
  slack: { label: 'Slack', icon: 'logo-slack', color: '#611F69' },
  google_calendar: { label: 'Google Calendar', icon: 'calendar', color: '#4285F4' },
  google_drive: { label: 'Google Drive', icon: 'logo-google', color: '#1FA463' },
  google_meet: { label: 'Google Meet', icon: 'videocam', color: '#00897B' },
  google_sheets: { label: 'Google Sheets', icon: 'grid', color: '#0F9D58' },
  google_docs: { label: 'Google Docs', icon: 'document-text', color: '#4285F4' },
  google_slides: { label: 'Google Slides', icon: 'easel', color: '#F4B400' },
  google_forms: { label: 'Google Forms', icon: 'list', color: '#7248B9' },
  meta_ads: { label: 'Meta Ads', icon: 'megaphone', color: '#0866FF' },
  google_ads: { label: 'Google Ads', icon: 'megaphone', color: '#4285F4' },
  tiktok_ads: { label: 'TikTok Ads', icon: 'megaphone' },
  linkedin_ads: { label: 'LinkedIn Ads', icon: 'megaphone', color: '#0A66C2' },
  x_ads: { label: 'X Ads', icon: 'megaphone' },
  mailchimp: { label: 'Mailchimp', icon: 'mail-open', color: '#FFE01B' },
  brevo: { label: 'Brevo', icon: 'mail-open', color: '#0B996E' },
};

export function platformMeta(platform?: string | null): PlatformMeta {
  if (!platform) return { label: 'Unknown', icon: 'apps' };
  return (
    PLATFORMS[platform] ?? {
      label: platform.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
      icon: 'apps',
    }
  );
}

/** Platforms the post composer can publish to. Mirrors POST_PLATFORMS on web. */
export const POST_PLATFORMS = [
  'facebook',
  'instagram',
  'linkedin',
  'x',
  'tiktok',
  'youtube',
  'pinterest',
] as const;
export type PostPlatform = (typeof POST_PLATFORMS)[number];
