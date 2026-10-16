/**
 * The three assertions the tests use, on node:assert: `assert` (truthy), `assertEquals` (deep,
 * strict) and `assertThrows` (optionally of a class, with a message containing some text).
 */
import nodeAssert from "node:assert/strict";

export function assert(condition: unknown, message?: string): asserts condition {
  nodeAssert.ok(condition, message);
}

export function assertEquals<T>(actual: T, expected: T, message?: string): void {
  nodeAssert.deepStrictEqual(actual, expected, message);
}

export function assertThrows(
  fn: () => unknown,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ErrorClass?: new (...args: any[]) => Error,
  includes?: string,
): void {
  nodeAssert.throws(fn, (e: unknown) => {
    if (ErrorClass && !(e instanceof ErrorClass)) return false;
    if (includes !== undefined && !(e instanceof Error && e.message.includes(includes))) {
      throw new nodeAssert.AssertionError({ message: `expected an error with "${includes}", got: ${e}` });
    }
    return true;
  });
}
