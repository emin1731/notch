import type { UserDto } from '@notch/shared';
import type { User } from '../generated/prisma/client.js';

export function toUserDto(user: User): UserDto {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    timezone: user.timezone,
    onboardedAt: user.onboardedAt?.toISOString() ?? null,
  };
}
