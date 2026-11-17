import type { LoginInput, RegisterInput, UserDto } from '@notch/shared';
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
};
