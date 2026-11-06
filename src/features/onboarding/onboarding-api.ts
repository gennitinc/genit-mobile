import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

import { api, ApiError } from '@/lib/api';
import {
  type BrandData,
  emptyBrand,
  type OnboardingRecord,
  type OnboardingStep,
  type SocialPlatform,
  type SocialUrls,
} from '@/lib/types';

type SavePatch = Partial<BrandData> & {
  onboardingStep?: OnboardingStep;
  onboardingCompleted?: boolean;
  onboardingSkipped?: boolean;
};

const MAX_LOGO_BYTES = 5 * 1024 * 1024;
/** The server visits several pages and runs AI over them, so this runs long. */
const IMPORT_TIMEOUT_MS = 120_000;

export async function saveOnboarding({ socials, screenshot: _screenshot, ...fields }: SavePatch) {
  const socialMediaUrls = socials
    ? Object.entries(socials)
        .filter(([, url]) => !!url)
        .map(([platform, url]) => ({ platform, url }))
    : undefined;
  await api('auth/onboarding/save', { body: { ...fields, socialMediaUrls } });
}

export async function importBrand(url: string): Promise<BrandData> {
  const { brand } = await api<{ brand: Partial<BrandData> }>('auth/onboarding/extract-brand', {
    body: { url },
    timeoutMs: IMPORT_TIMEOUT_MS,
  });
  return { ...emptyBrand, ...brand, socials: brand.socials ?? {} };
}

/** Opens the photo library and uploads the choice. Resolves to null if cancelled. */
export async function pickAndUploadLogo(): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.9,
  });
  if (result.canceled) return null;

  const asset = result.assets[0];
  if (asset.fileSize && asset.fileSize > MAX_LOGO_BYTES) {
    throw new ApiError(400, 'Your logo must be under 5MB.');
  }

  // The global fetch is expo/fetch, which rejects React Native's { uri, name, type } parts.
  const form = new FormData();
  form.append('brandLogo', new File(asset.uri));

  const { onboarding } = await api<{ onboarding?: OnboardingRecord }>('auth/onboarding/save', {
    form,
    timeoutMs: IMPORT_TIMEOUT_MS,
  });
  // The server still answers 200 when its storage upload fails.
  if (!onboarding?.brandLogo) throw new ApiError(500, 'We could not upload your logo. Please try again.');
  return onboarding.brandLogo;
}

export function brandFromRecord(record: OnboardingRecord): BrandData {
  const socials: SocialUrls = {};
  for (const entry of record.socialMediaUrls ?? []) {
    if (entry?.platform && entry?.url) socials[entry.platform as SocialPlatform] = entry.url;
  }
  return {
    ...emptyBrand,
    companyWebsite: record.companyWebsite ?? '',
    businessName: record.businessName ?? '',
    businessBio: record.businessBio ?? '',
    industry: record.industry ?? '',
    brandLogo: record.brandLogo ?? '',
    ogImage: record.ogImage ?? '',
    brandColors: record.brandColors ?? [],
    primaryColor: record.primaryColor ?? '',
    secondaryColor: record.secondaryColor ?? '',
    fontHeadline: record.fontHeadline ?? '',
    fontBody: record.fontBody ?? '',
    aboutUs: record.aboutUs ?? '',
    mission: record.mission ?? '',
    vision: record.vision ?? '',
    slogan: record.slogan ?? '',
    values: record.values ?? [],
    voiceTone: record.voiceTone ?? [],
    role: record.role ?? '',
    hearAboutUs: record.hearAboutUs ?? '',
    socials,
  };
}

const STEPS: OnboardingStep[] = ['import', 'dna', 'questions'];

export function stepFromRecord(record: OnboardingRecord | null): OnboardingStep {
  const step = record?.onboardingStep as OnboardingStep | undefined;
  return step && STEPS.includes(step) ? step : 'import';
}

export function stepNumber(step: OnboardingStep) {
  return { current: STEPS.indexOf(step) + 1, total: STEPS.length };
}
