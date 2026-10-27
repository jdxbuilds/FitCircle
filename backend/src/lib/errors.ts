export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what = 'Not found') => new ApiError(404, 'not_found', what);
export const forbidden = (why = 'You do not have access to this') => new ApiError(403, 'forbidden', why);
export const badRequest = (why: string) => new ApiError(400, 'bad_request', why);
export const conflict = (why: string) => new ApiError(409, 'conflict', why);

interface MysqlError {
  errno?: number;
  sqlState?: string;
  sqlMessage?: string;
}

/** Turns a database rule violation into a response the app can show to the user. */
export function fromDbError(e: unknown, duplicateMessage = 'This already exists'): ApiError | null {
  const err = e as MysqlError;
  if (!err || typeof err !== 'object' || err.errno === undefined) return null;
  // SIGNAL from our triggers and procedures: the message is written for people.
  if (err.sqlState === '45000') return new ApiError(422, 'rule_violation', err.sqlMessage ?? 'Not allowed');
  if (err.errno === 3819) return new ApiError(422, 'invalid', 'Those values are not allowed for this challenge');
  if (err.errno === 1062) return new ApiError(409, 'conflict', duplicateMessage);
  if (err.errno === 1452) return new ApiError(404, 'not_found', 'A related record does not exist');
  if (err.errno === 1048) return new ApiError(400, 'bad_request', err.sqlMessage ?? 'A required value is missing');
  return null;
}

/** Runs a write and rethrows database rule violations as ApiErrors. */
export async function guard<T>(fn: () => Promise<T>, duplicateMessage?: string): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    throw fromDbError(e, duplicateMessage) ?? e;
  }
}
