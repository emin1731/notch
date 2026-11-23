import type { CreateHabitInput, HabitDetailDto, HabitDto, UpdateHabitInput } from '@notch/shared';
import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/forms';
import { invalidate, queryKeys } from '@/lib/query-keys';
import { habitsApi } from './api';

export function useHabits(includeArchived: boolean) {
  return useQuery({
    queryKey: queryKeys.habits.list({ includeArchived }),
    queryFn: () => habitsApi.list(includeArchived),
  });
}

export function useHabit(id: string) {
  return useQuery({ queryKey: queryKeys.habit(id), queryFn: () => habitsApi.get(id) });
}

/** A habit change refreshes the lists it shows in. */
function afterChange(client: QueryClient, habit: HabitDetailDto) {
  client.setQueryData(queryKeys.habit(habit.id), habit);
  return invalidate.habitChange(client, { habitId: habit.id });
}

export function useCreateHabit() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateHabitInput) => habitsApi.create(input),
    onSuccess: (habit) => afterChange(client, habit),
  });
}

export function useUpdateHabit() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateHabitInput }) =>
      habitsApi.update(id, input),
    onSuccess: (habit) => afterChange(client, habit),
  });
}

export function useArchiveHabit() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, archive }: { id: string; archive: boolean }) =>
      archive ? habitsApi.archive(id) : habitsApi.unarchive(id),
    onSuccess: (habit) => afterChange(client, habit),
  });
}

export function useDeleteHabit() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (habit: HabitDto) => habitsApi.delete(habit.id),
    onSuccess: (_, habit) => {
      client.removeQueries({ queryKey: queryKeys.habit(habit.id) });
      return invalidate.habitChange(client);
    },
  });
}

/** Moves the habits at once; puts them back, with a toast, if the server says no. */
export function useReorderHabits(includeArchived: boolean) {
  const client = useQueryClient();
  const queryKey = queryKeys.habits.list({ includeArchived });
  return useMutation({
    /** `ids`: the reordered group; it moves ahead of every other habit. */
    mutationFn: (ids: string[]) => habitsApi.order(ids),
    onMutate: async (ids) => {
      await client.cancelQueries({ queryKey });
      const previous = client.getQueryData<HabitDto[]>(queryKey);
      if (previous) {
        const byId = new Map(previous.map((habit) => [habit.id, habit]));
        const moved = ids.map((id) => byId.get(id)).filter((habit) => habit !== undefined);
        client.setQueryData<HabitDto[]>(queryKey, [
          ...moved,
          ...previous.filter((habit) => !ids.includes(habit.id)),
        ]);
      }
      return { previous };
    },
    onError: (error, _ids, context) => {
      client.setQueryData(queryKey, context?.previous);
      toast.error(`Couldn't save the new order. ${apiErrorMessage(error)}`);
    },
    onSettled: () => invalidate.habitOrder(client),
  });
}
