import type { CoreDto, CreateCoreInput, UpdateCoreInput } from '@notch/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/forms';
import { invalidate, queryKeys } from '@/lib/query-keys';
import { coresApi } from './api';

export function useCores(includeArchived: boolean) {
  return useQuery({
    queryKey: queryKeys.cores.list(includeArchived),
    queryFn: () => coresApi.list(includeArchived),
  });
}

export function useCreateCore() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCoreInput) => coresApi.create(input),
    onSuccess: () => invalidate.coreChange(client),
  });
}

export function useUpdateCore() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCoreInput }) =>
      coresApi.update(id, input),
    onSuccess: () => invalidate.coreChange(client),
  });
}

export function useArchiveCore() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, archive }: { id: string; archive: boolean }) =>
      archive ? coresApi.archive(id) : coresApi.unarchive(id),
    onSuccess: () => invalidate.coreArchive(client),
  });
}

export function useDeleteCore() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => coresApi.delete(id),
    onSuccess: () => invalidate.coreChange(client),
  });
}

/** Moves the cores at once; puts them back, with a toast, if the server says no. */
export function useReorderCores(includeArchived: boolean) {
  const client = useQueryClient();
  const queryKey = queryKeys.cores.list(includeArchived);
  return useMutation({
    mutationFn: (ids: string[]) => coresApi.order(ids),
    onMutate: async (ids) => {
      await client.cancelQueries({ queryKey });
      const previous = client.getQueryData<CoreDto[]>(queryKey);
      if (previous) {
        const byId = new Map(previous.map((core) => [core.id, core]));
        client.setQueryData<CoreDto[]>(
          queryKey,
          ids.map((id) => byId.get(id)).filter((core) => core !== undefined),
        );
      }
      return { previous };
    },
    onError: (error, _ids, context) => {
      client.setQueryData(queryKey, context?.previous);
      toast.error(`Couldn't save the new order. ${apiErrorMessage(error)}`);
    },
    onSettled: () => invalidate.coreChange(client),
  });
}
