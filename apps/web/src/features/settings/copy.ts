/** Settings' words (plan 7.5). */
export const SETTINGS_COPY = {
  profileSaved: 'Saved.',
  timezoneSaved: (zone: string) => `Timezone updated. Today now follows ${zone}.`,
  timezoneHint: 'Days and weeks follow this timezone. Logs you already have keep their dates.',
  passwordChanged: 'Password changed. Your other devices were logged out.',
  wrongPassword: 'That password isn’t right.',
  loggedOutEverywhere: 'Logged out everywhere.',
  accountDeleted: 'Your account was deleted.',
  nothingArchived: 'Nothing archived. Archived cores, goals and habits show up here.',
  coreArchivedFirst: (core: string) => `In ${core}, which is archived: unarchive it first.`,
} as const;
