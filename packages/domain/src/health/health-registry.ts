import type {Logger} from 'pino';
import type {SanitizedError} from '../shared';

/**
 * Known components whose health is tracked in the registry.
 * Extend this union when a new component starts reporting.
 */
export type ComponentName =
  | 'atomiq'
  | 'database'
  | 'starknet-rpc'
  | 'avnu-paymaster'
  | 'avnu-swap'
  | 'coingecko-price';

export type ComponentStatus = 'healthy' | 'down';

export type OverallStatus = 'healthy' | 'degraded';

export interface ComponentHealth {
  readonly name: ComponentName;
  readonly status: ComponentStatus;
  readonly lastError: SanitizedError | undefined;
  readonly lastHealthyAt: Date | undefined;
  readonly downSince: Date | undefined;
  readonly lastCheckAt: Date | undefined;
}

export interface HealthSnapshot {
  readonly overall: OverallStatus;
  readonly components: readonly ComponentHealth[];
  readonly updatedAt: Date;
}

export interface HealthTransitionEvent {
  readonly component: ComponentName;
  readonly from: ComponentStatus;
  readonly to: ComponentStatus;
  readonly error: SanitizedError | undefined;
  readonly downtimeMs: number | undefined;
  readonly snapshot: HealthSnapshot;
}

export type HealthTransitionListener = (event: HealthTransitionEvent) => void;

interface MutableComponentHealth {
  name: ComponentName;
  status: ComponentStatus;
  lastError: SanitizedError | undefined;
  lastHealthyAt: Date | undefined;
  downSince: Date | undefined;
  lastCheckAt: Date | undefined;
}

/**
 * In-memory registry tracking the health of multiple application components.
 *
 * Components report their state via reportHealthy/reportDown. On an actual
 * status transition (not on repeated reports of the same state), the registry
 * fires the injected listener with a structured event containing a snapshot
 * of all components.
 *
 * The registry is pure domain: it has no knowledge of Slack, HTTP, or any
 * other infrastructure. Callers wire a listener that forwards events to the
 * concrete notification channel.
 */
export class HealthRegistry {
  private readonly components = new Map<ComponentName, MutableComponentHealth>();
  private readonly log: Logger;

  constructor(
    components: readonly ComponentName[],
    private readonly onTransition: HealthTransitionListener,
    logger: Logger,
  ) {
    this.log = logger.child({name: 'health-registry.ts'});
    const now = new Date();
    for (const name of components) {
      this.components.set(name, {
        name,
        status: 'healthy',
        lastError: undefined,
        lastHealthyAt: now,
        downSince: undefined,
        lastCheckAt: undefined,
      });
    }
  }

  reportHealthy(name: ComponentName): void {
    const current = this.requireComponent(name);
    const now = new Date();
    const previousStatus = current.status;
    const previousDownSince = current.downSince;

    current.lastCheckAt = now;
    current.lastHealthyAt = now;
    current.lastError = undefined;
    current.status = 'healthy';
    current.downSince = undefined;

    if (previousStatus === 'healthy') {
      return;
    }

    const downtimeMs = previousDownSince === undefined
      ? undefined
      : now.getTime() - previousDownSince.getTime();

    this.fire({
      component: name,
      from: previousStatus,
      to: 'healthy',
      error: undefined,
      downtimeMs,
      snapshot: this.getState(),
    });
  }

  reportDown(name: ComponentName, error: SanitizedError): void {
    const current = this.requireComponent(name);
    const now = new Date();
    const previousStatus = current.status;

    current.lastCheckAt = now;
    current.lastError = error;
    current.status = 'down';
    if (previousStatus !== 'down') {
      current.downSince = now;
    }

    if (previousStatus === 'down') {
      return;
    }

    this.fire({
      component: name,
      from: previousStatus,
      to: 'down',
      error,
      downtimeMs: undefined,
      snapshot: this.getState(),
    });
  }

  getState(): HealthSnapshot {
    const components: ComponentHealth[] = [];
    let anyDown = false;
    for (const comp of this.components.values()) {
      if (comp.status === 'down') {
        anyDown = true;
      }
      components.push({
        name: comp.name,
        status: comp.status,
        lastError: comp.lastError,
        lastHealthyAt: comp.lastHealthyAt,
        downSince: comp.downSince,
        lastCheckAt: comp.lastCheckAt,
      });
    }
    return {
      overall: anyDown ? 'degraded' : 'healthy',
      components,
      updatedAt: new Date(),
    };
  }

  private requireComponent(name: ComponentName): MutableComponentHealth {
    const comp = this.components.get(name);
    if (!comp) {
      throw new Error(`HealthRegistry: component '${name}' was not declared at construction time`);
    }
    return comp;
  }

  private fire(event: HealthTransitionEvent): void {
    try {
      this.onTransition(event);
    } catch (err: unknown) {
      this.log.warn(
        {component: event.component, cause: err instanceof Error ? err.message : String(err)},
        'HealthRegistry transition listener threw; ignoring',
      );
    }
  }
}
