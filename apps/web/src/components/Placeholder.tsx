import { Hammer } from 'lucide-react';
import type { ReactNode } from 'react';
import { EmptyState } from './EmptyState';
import { PageHeader } from './PageHeader';

/** A page that a later sprint (docs/web-sprints.md) fills in. */
export function Placeholder({
  title,
  sprint,
  description,
  children,
}: {
  title: string;
  sprint: string;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <EmptyState icon={Hammer} title="Coming soon">
        {children ?? <>This screen is built in sprint {sprint}.</>}
      </EmptyState>
    </>
  );
}
