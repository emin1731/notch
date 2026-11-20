import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from './auth-context';
import { queryKeys } from '@/lib/query-keys';
import { accountApi, authApi } from './api';
import { startSession } from './session';

export function useLogin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: authApi.login,
    onSuccess: (user) => startSession(client, user),
  });
}

export function useRegister() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: authApi.register,
    onSuccess: (user) => startSession(client, user),
  });
}

/** "Log out": RequireAuth then sends you to the login page. */
export function useLogout() {
  const { logout } = useAuth();
  return useMutation({ mutationFn: logout });
}

/** Saves name or timezone; the returned user replaces `['me']`. */
export function useUpdateProfile() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: accountApi.update,
    onSuccess: (user) => {
      startSession(client, user);
      // A new timezone moves "today": every day-based query reads differently now.
      void client.invalidateQueries({
        predicate: (query) => query.queryKey[0] !== queryKeys.me[0],
      });
    },
  });
}

export function useChangePassword() {
  return useMutation({ mutationFn: accountApi.changePassword });
}

/** Marks onboarding done: RequireOnboarded then lets the user into the app. */
export function useCompleteOnboarding() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: accountApi.completeOnboarding,
    onSuccess: (user) => startSession(client, user),
  });
}

/** Logs out every device, this one too. */
export function useLogoutAll() {
  const { signedOut } = useAuth();
  return useMutation({ mutationFn: authApi.logoutAll, onSuccess: signedOut });
}

export function useDeleteAccount() {
  const { signedOut } = useAuth();
  return useMutation({ mutationFn: accountApi.delete, onSuccess: signedOut });
}
