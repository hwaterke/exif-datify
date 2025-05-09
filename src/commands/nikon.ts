import {ExiftoolService} from '@hwaterke/media-probe'
import {Args, Command, Flags} from '@oclif/core'
import {Logger} from '../lib/Logger.js'
import {processNikon} from '../lib/processNikon.js'
import {forEachFile} from '../lib/utils.js'

export default class NikonCommand extends Command {
  static description = 'write proper time for Nikon files'

  static flags = {
    dryRun: Flags.boolean({
      char: 'd',
      description: 'dry run',
    }),
    zone: Flags.string({
      char: 'z',
      description:
        'IANA time zone where the pictures/videos were taken e.g. Europe/Brussels',
      required: true,
    }),
  }

  static args = {
    path: Args.string({
      name: 'path',
      description: 'path to file or directory to process',
      required: true,
    }),
  }

  async run() {
    const {
      args: {path},
      flags,
    } = await this.parse(NikonCommand)

    const exifService = new ExiftoolService({logger: Logger})

    await forEachFile({
      path,
      recursive: true,
      callback: async (entry) => {
        await processNikon({
          path: entry,
          logger: Logger,
          metadata: await exifService.extractExifMetadata(entry),
          zone: flags.zone,
          dryRun: flags.dryRun,
          exifService,
        })
      },
      log: (message) => Logger.info(message),
      videosLast: false,
    })
  }
}
