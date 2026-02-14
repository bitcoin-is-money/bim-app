import {Account} from '@bim/domain/account';
import {Session} from '@bim/domain/auth';
import type {Hono} from 'hono';

export type AppVariables = {
  requestId: string;
};

export type AuthenticatedContext = AppVariables & {
  session: Session;
  account: Account;
};

export type AuthenticatedHono = Hono<{
  Variables: AuthenticatedContext;
}>;
