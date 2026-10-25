/**
 * Type shim for @mixmark-io/domino — the package's own index.d.ts declares
 * `declare module 'domino'` (the old name), so the real specifier resolves
 * untyped. We only need createDocument().
 */
declare module "@mixmark-io/domino" {
  export function createDocument(html?: string, force?: boolean): {
    readonly body: unknown;
    readonly documentElement: unknown;
  };
}
