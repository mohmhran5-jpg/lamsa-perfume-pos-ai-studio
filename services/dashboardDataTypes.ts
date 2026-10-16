export type DashboardDataSourceKey =
  | 'sales'
  | 'products'
  | 'expenses'
  | 'settings'
  | 'vaults'
  | 'withdrawals'
  | 'closures'
  | 'customers';

export type DashboardDataSourceState =
  | 'connecting'
  | 'live'
  | 'cached'
  | 'pending'
  | 'error'
  | 'missing'
  | 'restricted';

export interface DashboardDataSourceHealth {
  state: DashboardDataSourceState;
  /** Client receipt time of the latest snapshot explicitly marked server-backed. */
  lastConfirmedAt: string | null;
}

export type DashboardDataSourceHealthMap = Record<DashboardDataSourceKey, DashboardDataSourceHealth>;
