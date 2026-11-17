import { Compass } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';

export default function NotFoundPage() {
  return (
    <EmptyState
      icon={Compass}
      title="Nothing here"
      action={
        <Button asChild variant="outline">
          <Link to="/today">Go to Today</Link>
        </Button>
      }
    >
      That page doesn't exist. It may have moved, or the link is wrong.
    </EmptyState>
  );
}
