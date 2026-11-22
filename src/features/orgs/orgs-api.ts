import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { brandFromRecord } from '@/features/onboarding/onboarding-api';
import type { BrandData, Organization, User } from '@/lib/types';

export function currentOrganization(user: User | null): Organization | null {
  const org = user?.currentOrganization;
  return org && typeof org === 'object' ? org : null;
}

export function useOrganizations() {
  return useQuery({
    queryKey: ['organizations'],
    queryFn: () => api<{ organizations: Organization[] }>('orgs'),
    select: (data) => data.organizations,
  });
}

/** The server keeps the active org on the user record, so this also switches the web session. */
export const switchOrganization = (id: string) => api(`orgs/switch/${id}`, { method: 'PATCH' });

/** Brand fields an organization stores, in the shape the server accepts. */
export function orgPayload(brand: BrandData) {
  return {
    businessName: brand.businessName.trim() || 'New workspace',
    businessBio: brand.businessBio || undefined,
    businessLogo: brand.brandLogo || undefined,
    businessWebsite: brand.companyWebsite || undefined,
    industry: brand.industry || undefined,
    brandColors: brand.brandColors,
    primaryColor: brand.primaryColor || undefined,
    secondaryColor: brand.secondaryColor || undefined,
    fontHeadline: brand.fontHeadline || undefined,
    fontBody: brand.fontBody || undefined,
    aboutUs: brand.aboutUs || undefined,
    mission: brand.mission || undefined,
    vision: brand.vision || undefined,
    slogan: brand.slogan || undefined,
    values: brand.values,
    voiceTone: brand.voiceTone,
    socialMediaUrls: Object.entries(brand.socials)
      .filter(([, url]) => !!url?.trim())
      .map(([platform, url]) => ({ platform, url: url!.trim() })),
  };
}

export function brandFromOrganization(org: Organization): BrandData {
  return brandFromRecord({
    companyWebsite: org.businessWebsite,
    businessName: org.businessName,
    businessBio: org.businessBio,
    industry: org.industry,
    brandLogo: org.businessLogo,
    brandColors: org.brandColors,
    primaryColor: org.primaryColor,
    secondaryColor: org.secondaryColor,
    fontHeadline: org.fontHeadline,
    fontBody: org.fontBody,
    aboutUs: org.aboutUs,
    mission: org.mission,
    vision: org.vision,
    slogan: org.slogan,
    values: org.values,
    voiceTone: org.voiceTone,
    socialMediaUrls: org.socialMediaUrls,
  });
}

/** Extra organizations need a paid plan; the server answers 402 otherwise. */
export const createOrganization = (brand: BrandData) =>
  api<{ organization: Organization }>('orgs', { body: orgPayload(brand) }).then((data) => data.organization);

export const updateOrganization = (id: string, brand: BrandData) => api(`orgs/${id}`, { method: 'PATCH', body: orgPayload(brand) });

export const deleteOrganization = (id: string) => api(`orgs/${id}`, { method: 'DELETE' });
