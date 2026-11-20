import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';

/** "← Cores & Goals": the way back from a detail page, a white pill on the page. */
export function BackLink({ to, children }: { to: string; children: string }) {
  return (
    <Button asChild variant="surface" className="mb-6 self-start">
      <Link to={to}>
        <ArrowLeft />
        {children}
      </Link>
    </Button>
  );
}
