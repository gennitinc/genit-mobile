export type SocialPlatform = 'facebook' | 'instagram' | 'linkedin' | 'youtube' | 'twitter' | 'tiktok';

export type SocialUrls = Partial<Record<SocialPlatform, string>>;

export type OnboardingStep = 'import' | 'dna' | 'questions';

/** The onboarding record as the server stores it, populated on the active user. */
export type OnboardingRecord = {
  onboardingCompleted?: boolean;
  onboardingSkipped?: boolean;
  onboardingStep?: string;
  companyWebsite?: string;
  businessName?: string;
  businessBio?: string;
  industry?: string;
  brandLogo?: string;
  ogImage?: string;
  brandColors?: string[];
  primaryColor?: string;
  secondaryColor?: string;
  fontHeadline?: string;
  fontBody?: string;
  aboutUs?: string;
  mission?: string;
  vision?: string;
  slogan?: string;
  values?: string[];
  voiceTone?: string[];
  role?: string;
  hearAboutUs?: string;
  socialMediaUrls?: { platform: string; url: string }[];
};

export type User = {
  _id: string;
  email: string;
  username?: string;
  userdp?: string;
  userPlan?: string;
  creditsRemaining?: number;
  creditsUsed?: number;
  emailVerified?: boolean;
  signInType?: 'email' | 'google';
  onboarding?: OnboardingRecord | string | null;
  currentOrganization?: Organization | string | null;
  allOrganizations?: (Organization | string)[];
};

export type Organization = {
  _id: string;
  businessName: string;
  businessLogo?: string;
  businessPlan?: string;
  owner?: string;
  businessBio?: string;
  businessWebsite?: string;
  industry?: string;
  brandColors?: string[];
  primaryColor?: string;
  secondaryColor?: string;
  fontHeadline?: string;
  fontBody?: string;
  slogan?: string;
  voiceTone?: string[];
  mission?: string;
  vision?: string;
  aboutUs?: string;
  values?: string[];
  socialMediaUrls?: { platform: string; url: string }[];
};

export type BrandData = {
  companyWebsite: string;
  businessName: string;
  businessBio: string;
  industry: string;
  brandLogo: string;
  ogImage: string;
  brandColors: string[];
  primaryColor: string;
  secondaryColor: string;
  fontHeadline: string;
  fontBody: string;
  aboutUs: string;
  mission: string;
  vision: string;
  slogan: string;
  values: string[];
  voiceTone: string[];
  role: string;
  hearAboutUs: string;
  socials: SocialUrls;
  /** Shown as a preview only; never saved. */
  screenshot?: string;
};

export const emptyBrand: BrandData = {
  companyWebsite: '',
  businessName: '',
  businessBio: '',
  industry: '',
  brandLogo: '',
  ogImage: '',
  brandColors: [],
  primaryColor: '',
  secondaryColor: '',
  fontHeadline: '',
  fontBody: '',
  aboutUs: '',
  mission: '',
  vision: '',
  slogan: '',
  values: [],
  voiceTone: [],
  role: '',
  hearAboutUs: '',
  socials: {},
};
