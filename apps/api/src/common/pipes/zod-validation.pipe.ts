import { Body, Injectable, type PipeTransform, Query } from '@nestjs/common';
import type { z } from 'zod';

/** Parses the value with a zod schema. A ZodError becomes 400 VALIDATION_FAILED in the filter. */
@Injectable()
export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform<unknown, z.output<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    return this.schema.parse(value);
  }
}

/** `@ZodBody(schema) body: z.output<typeof schema>` */
export const ZodBody = (schema: z.ZodType): ParameterDecorator =>
  Body(new ZodValidationPipe(schema));

/** `@ZodQuery(schema) query: z.output<typeof schema>` */
export const ZodQuery = (schema: z.ZodType): ParameterDecorator =>
  Query(new ZodValidationPipe(schema));
