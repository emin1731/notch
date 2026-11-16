import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { AuthedRequest, AuthUser } from './request-auth.js';

export const IS_PUBLIC_KEY = 'isPublic';

/** Skips SessionGuard. CsrfGuard still applies to unsafe methods. */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);

function requireAuth(ctx: ExecutionContext) {
  const auth = ctx.switchToHttp().getRequest<AuthedRequest>().auth;
  if (!auth) {
    throw new Error('No session on the request: is the route marked @Public()?');
  }
  return auth;
}

/** `{ id, username, timezone }` of the logged-in user. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => requireAuth(ctx).user,
);

/** The id of the current session, e.g. to keep it when revoking the others. */
export const CurrentSessionId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => requireAuth(ctx).sessionId,
);
