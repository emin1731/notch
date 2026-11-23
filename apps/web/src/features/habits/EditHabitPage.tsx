import { SearchX, TriangleAlert } from 'lucide-react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCores } from '@/features/cores/hooks';
import { isApiError } from '@/lib/api-client';
import { valuesFromHabit } from './habit-form';
import { HabitForm } from './HabitForm';
import { useHabit } from './hooks';

/** `/habits/:habitId/edit`. Creating is `AddHabitDialog`, over whatever page you're on. */
export default function EditHabitPage() {
  const { habitId = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const habit = useHabit(habitId);
  // Save and Cancel go back where you came from (the habit's page, Today or Cores); with no page
  // before this one in the app (a fresh tab, a reload), to the habit's page.
  const back = () =>
    location.key === 'default'
      ? void navigate(`/habits/${habitId}`, { replace: true })
      : void navigate(-1);
  const cores = useCores(true);

  if (habit.isPending || cores.isPending) {
    return <FormSkeleton />;
  }
  if (habit.isError) {
    if (isApiError(habit.error) && [400, 404].includes(habit.error.status)) {
      return (
        <EmptyState
          icon={SearchX}
          title="Habit not found"
          action={
            <Button asChild variant="outline">
              <Link to="/cores">Back to Cores</Link>
            </Button>
          }
        >
          It may have been deleted, or the link is wrong.
        </EmptyState>
      );
    }
    return <LoadError onRetry={() => void habit.refetch()} />;
  }
  if (cores.isError) {
    return <LoadError onRetry={() => void cores.refetch()} />;
  }
  // Active cores, plus the habit's own even if it's archived.
  const choosable = cores.data.filter((core) => !core.archivedAt || core.id === habit.data.coreId);
  return (
    <>
      <PageHeader title="Edit habit" description={habit.data.name} />
      <HabitForm
        key={habit.data.id}
        variant="page"
        habit={habit.data}
        cores={choosable}
        initial={valuesFromHabit(habit.data)}
        cancel={
          <Button type="button" variant="surface" size="lg" onClick={back}>
            Cancel
          </Button>
        }
        onSaved={back}
      />
    </>
  );
}

function FormSkeleton() {
  return (
    <>
      <PageHeader title="Edit habit" />
      <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading">
        <Skeleton className="h-48 w-full rounded-3xl" />
        <Skeleton className="h-40 w-full rounded-3xl" />
      </div>
    </>
  );
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <EmptyState
      icon={TriangleAlert}
      title="Couldn't load this form"
      action={
        <Button variant="outline" onClick={onRetry}>
          Try again
        </Button>
      }
    >
      Check your connection and try again.
    </EmptyState>
  );
}
