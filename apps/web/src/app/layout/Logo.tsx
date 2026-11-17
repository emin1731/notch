import { Link } from 'react-router';

export function Logo() {
  return (
    <Link to="/today" className="flex items-center gap-2 rounded-md font-semibold tracking-tight">
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden="true">
        <rect width="32" height="32" rx="8" className="fill-foreground" />
        <path
          d="M9 22V10l14 12V10"
          fill="none"
          className="stroke-background"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="text-lg">notch</span>
    </Link>
  );
}
