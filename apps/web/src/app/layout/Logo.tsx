import { Link } from 'react-router';

/** The wordmark: "notch" in Playfair Display. */
export function Logo() {
  return (
    <Link to="/today" className="rounded-md font-logo text-2xl leading-none font-extrabold">
      notch
    </Link>
  );
}
