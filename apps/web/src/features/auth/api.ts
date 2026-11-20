import type {
  ChangePasswordInput,
  DeleteAccountInput,
  LoginInput,
  RegisterInput,
  UpdateProfileInput,
  UserDto,
} from '@notch/shared';
import { api, ensureCsrf, isApiError } from '@/lib/api-client';

export const authApi = {
  /** The logged-in user, or `null` when logged out. Also makes sure the CSRF cookie exists. */
  async me(): Promise<UserDto | null> {
    await ensureCsrf();
    try {
      return await api.get<UserDto>('/auth/me', { authHandler: false });
    } catch (error) {
      if (isApiError(error) && error.status === 401) {
        return null;
      }
      throw error;
    }
  },
  login: (input: LoginInput) => api.post<UserDto>('/auth/login', input),
  register: (input: RegisterInput) => api.post<UserDto>('/auth/register', input),
  logout: () => api.post<void>('/auth/logout', undefined, { authHandler: false }),
  /** Ends every session of the user, this one included. */
  logoutAll: () => api.post<void>('/auth/logout-all'),
};

/** The logged-in user's own account (`/me`). */
export const accountApi = {
  update: (input: UpdateProfileInput) => api.patch<UserDto>('/me', input),
  /** Keeps this session and ends every other one. */
  changePassword: (input: ChangePasswordInput) => api.post<void>('/me/password', input),
  /** Sets `onboardedAt`, once. */
  completeOnboarding: () => api.post<UserDto>('/me/onboarding/complete'),
  /** Deletes the account and everything in it; the password confirms it. */
  delete: (input: DeleteAccountInput) => api.delete<void>('/me', input),
};
