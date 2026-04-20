import { Injectable } from '@angular/core';

export type FeatureFlagKey = 'uriPrefixOptionToggle';

const FLAGS: ReadonlyMap<FeatureFlagKey, boolean> = new Map<FeatureFlagKey, boolean>([
  ['uriPrefixOptionToggle', false],
]);

@Injectable({ providedIn: 'root' })
export class FeatureFlagsService {
  isEnabled(key: FeatureFlagKey): boolean {
    return FLAGS.get(key) ?? false;
  }
}
