/* eslint-disable @typescript-eslint/no-explicit-any */
// Shared context type used by all admin section pages. Defined loosely because
// the Account admin shell exposes a large amount of state/handlers that would
// be impractical to maintain as a hand-written interface. Each section page
// destructures only the fields it needs.
export type AdminCtx = Record<string, any>;
