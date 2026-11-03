import { sql as initial } from './001-initial.js';

export interface Migration {
  version: number;
  sql: string;
}

/** Ordered list of schema migrations. Append only; never edit a released entry. */
export const MIGRATIONS: Migration[] = [{ version: 1, sql: initial }];
