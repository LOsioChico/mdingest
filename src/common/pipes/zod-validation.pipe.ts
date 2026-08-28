import {
  type ArgumentMetadata,
  type PipeTransform,
  UnprocessableEntityException,
} from "@nestjs/common";
import { ZodError, type ZodSchema } from "zod";

/**
 * Zod validation pipe.
 * Validates controller input against a Zod schema.
 * Throws UnprocessableEntityException with VALIDATION.FAILED code on failure.
 *
 * Usage:
 *   @Query(new ZodValidationPipe(MySchema)) query: MyType
 */

export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown, _metadata: ArgumentMetadata): unknown {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new ZodValidationException(result.error);
    }
    return result.data;
  }
}

export class ZodValidationException extends UnprocessableEntityException {
  constructor(public readonly zodError: ZodError) {
    super({
      code: "VALIDATION.FAILED",
      message: "Request validation failed.",
      details: zodError.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    });
  }
}
