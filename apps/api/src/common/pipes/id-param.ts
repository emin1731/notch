import { Injectable, Param, type PipeTransform } from '@nestjs/common';
import { uuidSchema } from '@notch/shared';
import type { AppException } from '../errors/app-exception.js';

/** A malformed id can't exist, so it's a 404 like any other unknown id: ids can't be probed. */
@Injectable()
export class IdParamPipe implements PipeTransform<unknown, string> {
  constructor(private readonly notFound: () => AppException) {}

  transform(value: unknown): string {
    const result = uuidSchema.safeParse(value);
    if (!result.success) {
      throw this.notFound();
    }
    return result.data;
  }
}

/** `@IdParam('id', coreNotFound) id: string` */
export const IdParam = (name: string, notFound: () => AppException): ParameterDecorator =>
  Param(name, new IdParamPipe(notFound));
