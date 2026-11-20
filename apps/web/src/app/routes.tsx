import { Navigate, type RouteObject } from 'react-router';
import { GuestOnly } from '@/features/auth/GuestOnly';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { RequireNotOnboarded, RequireOnboarded } from '@/features/auth/RequireOnboarded';
import { AppShell } from './layout/AppShell';
import { GuestLayout } from './layout/GuestLayout';
import { OnboardingLayout } from './layout/OnboardingLayout';
import { RouteError } from './RouteError';

type PageModule = Promise<{ default: React.ComponentType }>;

/** Each page is its own chunk. */
const page = (load: () => PageModule) => async () => ({ Component: (await load()).default });

/** Plan 7.1. Every route shows `RouteError` instead of crashing. */
export const routes: RouteObject[] = [
  {
    errorElement: <RouteError />,
    children: [
      {
        Component: GuestOnly,
        children: [
          {
            Component: GuestLayout,
            children: [
              { path: '/login', lazy: page(() => import('@/features/auth/LoginPage')) },
              { path: '/register', lazy: page(() => import('@/features/auth/RegisterPage')) },
            ],
          },
        ],
      },
      {
        Component: RequireAuth,
        children: [
          {
            Component: RequireNotOnboarded,
            children: [
              {
                Component: OnboardingLayout,
                children: [
                  {
                    path: '/onboarding',
                    lazy: page(() => import('@/features/onboarding/OnboardingPage')),
                  },
                ],
              },
            ],
          },
          {
            Component: RequireOnboarded,
            children: [
              {
                Component: AppShell,
                children: [
                  { path: '/', element: <Navigate to="/today" replace /> },
                  { path: '/today', lazy: page(() => import('@/features/today/TodayPage')) },
                  { path: '/cores', lazy: page(() => import('@/features/cores/CoresPage')) },
                  { path: '/goals/:goalId', lazy: page(() => import('@/features/goals/GoalPage')) },
                  {
                    path: '/habits/new',
                    lazy: page(() => import('@/features/habits/HabitFormPage')),
                  },
                  {
                    path: '/habits/:habitId',
                    lazy: page(() => import('@/features/habits/HabitPage')),
                  },
                  {
                    path: '/habits/:habitId/edit',
                    lazy: page(() => import('@/features/habits/HabitFormPage')),
                  },
                  { path: '/review', lazy: page(() => import('@/features/review/ReviewPage')) },
                  {
                    path: '/review/:weekStart',
                    lazy: page(() => import('@/features/review/ReviewPage')),
                  },
                  { path: '/stats', lazy: page(() => import('@/features/stats/StatsPage')) },
                  {
                    path: '/settings',
                    lazy: page(() => import('@/features/settings/SettingsPage')),
                  },
                  { path: '*', lazy: page(() => import('./NotFoundPage')) },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
];
