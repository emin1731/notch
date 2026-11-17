import { useParams } from 'react-router';
import { Placeholder } from '@/components/Placeholder';

export default function HabitFormPage() {
  const { habitId } = useParams();
  return <Placeholder title={habitId ? 'Edit habit' : 'New habit'} sprint="W3" />;
}
