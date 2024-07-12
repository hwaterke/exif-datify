export const Logger = {
  debug(message: string, ...meta: unknown[]) {
    console.debug(message, ...meta)
  },
  info(message: string, ...meta: unknown[]) {
    console.info(message, ...meta)
  },
  error(message: string, ...meta: unknown[]) {
    console.error(message, ...meta)
  },
}
