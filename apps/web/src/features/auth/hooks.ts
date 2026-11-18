import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from './auth-context';
import { authApi } from './api';
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
