import {
  Apple,
  Baby,
  Bed,
  Bike,
  BookOpen,
  Brain,
  Briefcase,
  Camera,
  ChartLine,
  Circle,
  Code,
  Coffee,
  Dog,
  Droplet,
  Dumbbell,
  Flower2,
  Footprints,
  Gamepad2,
  Globe,
  GraduationCap,
  HandHeart,
  Heart,
  HeartPulse,
  House,
  Languages,
  Laptop,
  Leaf,
  type LucideIcon,
  Moon,
  Mountain,
  Music,
  Palette,
  PenLine,
  PiggyBank,
  Plane,
  Salad,
  Smile,
  Sparkles,
  Sun,
  Target,
  Trophy,
  Users,
  Utensils,
  Wallet,
} from 'lucide-react';

export interface CoreIconOption {
  /** The lucide name the API stores, e.g. "heart-pulse". */
  name: string;
  label: string;
  icon: LucideIcon;
  /** Extra words the picker's search matches. */
  keywords: string;
}

/**
 * The icons offered for a core: life areas, not all of lucide (which would bloat the bundle).
 * Includes every `CORE_PRESETS` icon.
 */
export const CORE_ICONS: readonly CoreIconOption[] = [
  { name: 'heart-pulse', label: 'Heart rate', icon: HeartPulse, keywords: 'health fitness cardio' },
  { name: 'dumbbell', label: 'Dumbbell', icon: Dumbbell, keywords: 'gym strength fitness workout' },
  { name: 'footprints', label: 'Footprints', icon: Footprints, keywords: 'walk run steps' },
  { name: 'bike', label: 'Bike', icon: Bike, keywords: 'cycling sport' },
  { name: 'mountain', label: 'Mountain', icon: Mountain, keywords: 'hike outdoors adventure' },
  { name: 'apple', label: 'Apple', icon: Apple, keywords: 'food nutrition diet' },
  { name: 'salad', label: 'Salad', icon: Salad, keywords: 'food nutrition diet eating' },
  { name: 'utensils', label: 'Cutlery', icon: Utensils, keywords: 'food cooking eating' },
  { name: 'droplet', label: 'Water', icon: Droplet, keywords: 'water hydration drink' },
  { name: 'bed', label: 'Bed', icon: Bed, keywords: 'sleep rest' },
  { name: 'moon', label: 'Moon', icon: Moon, keywords: 'sleep night evening' },
  { name: 'sun', label: 'Sun', icon: Sun, keywords: 'morning day energy' },
  { name: 'brain', label: 'Brain', icon: Brain, keywords: 'mind mental focus' },
  { name: 'leaf', label: 'Leaf', icon: Leaf, keywords: 'calm meditation nature mindfulness' },
  { name: 'flower-2', label: 'Flower', icon: Flower2, keywords: 'calm self-care nature' },
  { name: 'smile', label: 'Smile', icon: Smile, keywords: 'happiness mood joy' },
  { name: 'sparkles', label: 'Sparkles', icon: Sparkles, keywords: 'growth habits magic' },
  { name: 'briefcase', label: 'Briefcase', icon: Briefcase, keywords: 'career work job' },
  { name: 'laptop', label: 'Laptop', icon: Laptop, keywords: 'work computer' },
  { name: 'code', label: 'Code', icon: Code, keywords: 'programming software work' },
  { name: 'chart-line', label: 'Chart', icon: ChartLine, keywords: 'growth business progress' },
  { name: 'target', label: 'Target', icon: Target, keywords: 'focus aim ambition' },
  { name: 'trophy', label: 'Trophy', icon: Trophy, keywords: 'win achievement competition' },
  { name: 'wallet', label: 'Wallet', icon: Wallet, keywords: 'money finance budget' },
  { name: 'piggy-bank', label: 'Piggy bank', icon: PiggyBank, keywords: 'money savings finance' },
  { name: 'book-open', label: 'Book', icon: BookOpen, keywords: 'learning reading study' },
  {
    name: 'graduation-cap',
    label: 'Graduation cap',
    icon: GraduationCap,
    keywords: 'learning study school',
  },
  { name: 'languages', label: 'Languages', icon: Languages, keywords: 'learning language' },
  { name: 'pen-line', label: 'Pen', icon: PenLine, keywords: 'writing journal' },
  { name: 'palette', label: 'Palette', icon: Palette, keywords: 'art creativity painting' },
  { name: 'music', label: 'Music', icon: Music, keywords: 'instrument creativity' },
  { name: 'camera', label: 'Camera', icon: Camera, keywords: 'photography creativity' },
  { name: 'gamepad-2', label: 'Gamepad', icon: Gamepad2, keywords: 'games play fun' },
  { name: 'users', label: 'People', icon: Users, keywords: 'relationships friends family social' },
  { name: 'heart', label: 'Heart', icon: Heart, keywords: 'love relationships partner' },
  {
    name: 'hand-heart',
    label: 'Giving',
    icon: HandHeart,
    keywords: 'kindness volunteering charity',
  },
  { name: 'baby', label: 'Baby', icon: Baby, keywords: 'family parenting kids' },
  { name: 'dog', label: 'Dog', icon: Dog, keywords: 'pet animals' },
  { name: 'house', label: 'House', icon: House, keywords: 'home chores household' },
  { name: 'coffee', label: 'Coffee', icon: Coffee, keywords: 'routine morning break' },
  { name: 'globe', label: 'Globe', icon: Globe, keywords: 'world travel' },
  { name: 'plane', label: 'Plane', icon: Plane, keywords: 'travel trip' },
];

const BY_NAME = new Map(CORE_ICONS.map((option) => [option.name, option]));

/** The component for a stored icon name; an unknown name gets a plain circle. */
export function coreIcon(name: string): LucideIcon {
  return BY_NAME.get(name)?.icon ?? Circle;
}

/** Icons whose name, label or keywords contain every word of the query. */
export function searchCoreIcons(query: string): readonly CoreIconOption[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return CORE_ICONS;
  }
  return CORE_ICONS.filter((option) => {
    const haystack = `${option.name} ${option.label} ${option.keywords}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}
