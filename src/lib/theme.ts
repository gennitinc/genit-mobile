import { useColorScheme } from 'react-native';

const brand = {
  primary: '#4F46E5',
  primaryPressed: '#4338CA',
  onPrimary: '#FFFFFF',
};

const light = {
  ...brand,
  background: '#FFFFFF',
  surface: '#F7F7F8',
  surfacePressed: '#EEEEF0',
  text: '#0A0A0A',
  textMuted: '#62626B',
  textFaint: '#8E8E96',
  border: '#E4E4E7',
  borderStrong: '#C9C9CF',
  selected: '#EEF2FF',
  selectedText: '#4338CA',
  danger: '#DC2626',
  dangerSurface: '#FEF2F2',
  success: '#15803D',
  successSurface: '#F0FDF4',
};

export type Colors = typeof light;

const dark: Colors = {
  ...brand,
  primary: '#6366F1',
  primaryPressed: '#4F46E5',
  background: '#000000',
  surface: '#141416',
  surfacePressed: '#202024',
  text: '#FAFAFA',
  textMuted: '#A1A1AA',
  textFaint: '#71717A',
  border: '#27272A',
  borderStrong: '#3F3F46',
  selected: '#1E1B4B',
  selectedText: '#C7D2FE',
  danger: '#F87171',
  dangerSurface: '#2A1215',
  success: '#4ADE80',
  successSurface: '#0F2417',
};

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}

export const radius = { sm: 8, md: 12, lg: 16, full: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, /** Side padding of every screen and drawer. */ page: 16 };
