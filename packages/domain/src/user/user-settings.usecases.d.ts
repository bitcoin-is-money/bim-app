import type { UserSettingsRepository } from '../ports/user-settings.repository';
import { UserSettings } from './user-settings';
import { UserSettingsId } from './types';
export interface UserSettingsUseCasesDeps {
    userSettingsRepository: UserSettingsRepository;
    idGenerator: () => UserSettingsId;
}
export interface FetchUserSettingsInput {
    accountId: string;
}
export interface FetchUserSettingsOutput {
    settings: UserSettings;
}
export type FetchUserSettingsUseCase = (input: FetchUserSettingsInput) => Promise<FetchUserSettingsOutput>;
/**
 * Fetches user settings for an account.
 * Creates default settings if none exist.
 */
export declare function getFetchUserSettingsUseCase(deps: UserSettingsUseCasesDeps): FetchUserSettingsUseCase;
export interface UpdateUserSettingsInput {
    accountId: string;
    fiatCurrency?: string;
}
export interface UpdateUserSettingsOutput {
    settings: UserSettings;
}
export type UpdateUserSettingsUseCase = (input: UpdateUserSettingsInput) => Promise<UpdateUserSettingsOutput>;
/**
 * Updates user settings for an account.
 */
export declare function getUpdateUserSettingsUseCase(deps: UserSettingsUseCasesDeps): UpdateUserSettingsUseCase;
//# sourceMappingURL=user-settings.usecases.d.ts.map