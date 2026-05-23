/**
 * apps/manager -- Custom Error Types
 *
 * Domain-specific errors for App lifecycle operations.
 * These allow callers to distinguish between different failure modes
 * without parsing error message strings.
 */

import type { AppStatus } from './types'

/**
 * Thrown when an operation references an App ID that does not exist in the database.
 */
export class AppNotFoundError extends Error {
  readonly appId: string

  constructor(appId: string) {
    super(`App not found: ${appId}`)
    this.name = 'AppNotFoundError'
    this.appId = appId
  }
}

/**
 * Thrown when a status transition violates the state machine rules.
 */
export class InvalidStatusTransitionError extends Error {
  readonly appId: string
  readonly fromStatus: AppStatus
  readonly toStatus: AppStatus

  constructor(appId: string, fromStatus: AppStatus, toStatus: AppStatus, customMessage?: string) {
    super(
      customMessage ??
      `Invalid status transition for App ${appId}: ` +
      `cannot move from '${fromStatus}' to '${toStatus}'`
    )
    this.name = 'InvalidStatusTransitionError'
    this.appId = appId
    this.fromStatus = fromStatus
    this.toStatus = toStatus
  }
}

/**
 * Thrown when attempting to install an App that is already installed
 * in the same scope (same specId + spaceId combination, or same specId globally).
 */
export class AppAlreadyInstalledError extends Error {
  readonly specId: string
  readonly spaceId: string | null

  constructor(specId: string, spaceId: string | null) {
    const scope = spaceId ? `space '${spaceId}'` : 'global scope'
    super(`App '${specId}' is already installed in ${scope}`)
    this.name = 'AppAlreadyInstalledError'
    this.specId = specId
    this.spaceId = spaceId
  }
}

/**
 * Thrown when the space referenced during install does not exist.
 */
export class SpaceNotFoundError extends Error {
  readonly spaceId: string

  constructor(spaceId: string) {
    super(`Space not found: ${spaceId}`)
    this.name = 'SpaceNotFoundError'
    this.spaceId = spaceId
  }
}

/**
 * Thrown when a destructive operation targets a built-in app.
 *
 * Built-in apps are bundled with the build itself (resources/builtin-apps/)
 * and re-materialized on every launch by the loader. Allowing users to hard-
 * delete them would create a confusing UX: the row would silently reappear
 * on next start, but with `userConfig` reset. The Manager rejects such ops
 * with this error so the IPC layer can return a clear message instead.
 *
 * Soft-uninstall (status='uninstalled') is still permitted and is the supported
 * way for users to "disable" a built-in — equivalent to VSCode's per-user
 * extension disable flag.
 */
export class BuiltinAppProtectedError extends Error {
  readonly appId: string
  readonly specId: string
  readonly operation: string

  constructor(appId: string, specId: string, operation: string) {
    super(
      `Built-in app '${specId}' (${appId}) cannot be ${operation}d. ` +
      `Built-in apps are bundled with the application; use uninstall to disable instead.`
    )
    this.name = 'BuiltinAppProtectedError'
    this.appId = appId
    this.specId = specId
    this.operation = operation
  }
}
