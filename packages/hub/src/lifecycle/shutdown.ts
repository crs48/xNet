/**
 * @xnet/hub - Graceful shutdown handler.
 */

export const registerShutdownHandlers = (
  stop: () => Promise<void>,
  logger: typeof console = console
): void => {
  let shutdownInProgress = false

  const shutdown = async (signal: string): Promise<void> => {
    if (shutdownInProgress) return
    shutdownInProgress = true
    logger.info(`[shutdown] Received ${signal}, shutting down...`)
    try {
      await stop()
      logger.info('[shutdown] Complete')
    } catch (err) {
      logger.error('[shutdown] Failed:', err)
    } finally {
      process.exit(0)
    }
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))

  process.on('uncaughtException', async (err) => {
    logger.error('[shutdown] Uncaught exception:', err)
    await shutdown('uncaughtException')
  })

  process.on('unhandledRejection', (reason) => {
    logger.error('[shutdown] Unhandled rejection:', reason)
  })
}
