export interface TransactionManager {
  execute<T>(fn: () => Promise<T>): Promise<T>;
}
