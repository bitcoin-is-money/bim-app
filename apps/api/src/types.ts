import type {Account} from '@bim/domain/account';
import type {Session} from '@bim/domain/auth';
import type {Hono} from 'hono';

export interface AppVariables {
  requestId: string;
}

export type AuthenticatedContext = AppVariables & {
  session: Session;
  account: Account;
};

export type AuthenticatedHono = Hono<{
  Variables: AuthenticatedContext;
}>;
