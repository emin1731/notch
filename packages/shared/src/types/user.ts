/** The user as returned by /auth/register, /auth/login, /auth/me and /me. */
export interface UserDto {
  id: string;
  username: string;
  name: string | null;
  timezone: string;
  /** ISO instant, or null until onboarding is finished. */
  onboardedAt: string | null;
}
