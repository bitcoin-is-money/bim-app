export * from './errors';
export * from './webauthn.types';
export * from './challenge';
export * from './session';
export * from './session.config';

// Use case interfaces (primary ports)
export type {
  BeginRegistrationInput,
  BeginRegistrationOutput,
  BeginRegistrationUseCase,
} from './use-cases/begin-registration.use-case';
export type {
  CompleteRegistrationInput,
  CompleteRegistrationOutput,
  CompleteRegistrationUseCase,
} from './use-cases/complete-registration.use-case';
export type {
  BeginLoginOutput,
  BeginLoginUseCase,
} from './use-cases/begin-login.use-case';
export type {
  CompleteLoginInput,
  CompleteLoginOutput,
  CompleteLoginUseCase,
} from './use-cases/complete-login.use-case';
export type {
  ValidateSessionInput,
  ValidateSessionOutput,
  ValidateSessionUseCase,
} from './use-cases/validate-session.use-case';
export type {
  InvalidateSessionInput,
  InvalidateSessionUseCase,
} from './use-cases/invalidate-session.use-case';

// Use case implementations (services)
export {Registrar, type RegistrarDeps} from './services/registrar.service';
export {Authenticator, type AuthenticatorDeps} from './services/authenticator.service';
export {SessionValidator, type SessionValidatorDeps} from './services/session-validator.service';
export {SessionInvalidator, type SessionInvalidatorDeps} from './services/session-invalidator.service';

// Internal domain service (no UseCase interface — not a primary port)
export {ChallengeConsumer, type ChallengeConsumerDeps} from './services/challenge-consumer.service';
