/** Registry service for discovering, browsing, installing, and publishing apps. */

export {
  initRegistryService,
  shutdownRegistryService,
  onSyncStatusChanged,
  onUpgradeAvailable,
  refreshIndex,
  queryStore,
  listApps,
  getAppDetail,
  installFromStore,
  checkUpdates,
  applyUpgrade,
  getRegistries,
  addRegistry,
  removeRegistry,
  toggleRegistry,
  updateRegistryAdapterConfig,
} from './registry.service'

export { checkNow as checkUpgradesNow, startUpgradeScheduler, stopUpgradeScheduler } from './upgrade.service'

export { publish } from './publish'
export { pack as packDhpkg, unpack as unpackDhpkg } from './dhpkg'
