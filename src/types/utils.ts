export type Values<T extends Record<keyof any, unknown>> = T[keyof T];
export type NotEmpty<T> = T extends Array<infer E> ? [E, ...E[]] : never;
