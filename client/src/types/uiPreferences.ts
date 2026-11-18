export type UserMotionMode = 'SYSTEM' | 'FULL' | 'REDUCED' | 'OFF';
export type CelebrationPreference = 'ALL' | 'MAJOR' | 'OFF';
export interface UiPreferences {
  motionMode: UserMotionMode;
  celebrations: CelebrationPreference;
  sound: boolean;
  haptics: boolean;
  updatedAt: string | null;
}
