import {Command, Flags} from '@oclif/core'
import * as fs from 'node:fs'
import * as nodePath from 'node:path'
import {isDirectory} from '../utils'
import * as chalk from 'chalk'
import {DatifyService} from '../DatifyService'

export default class ExifDatify extends Command {
  static description =
    'rename files with date and time information from Exif data'

  static flags = {
    dryRun: Flags.boolean({
      char: 'd',
      description: 'show how files would be renamed without doing it',
    }),
    prefix: Flags.string({
      char: 'p',
      description: 'Format used for the prefix, see luxon documentation',
      default: 'yyyy-MM-dd_HH-mm-ss_',
    }),
    extensions: Flags.string({
      char: 'e',
      description:
        'which file extensions to process (comma separated) e.g. (mov,mp4,jpg)',
    }),
    zone: Flags.string({
      char: 'z',
      description:
        'which IANA time zone to use for the date and time information found in UTC (default is local time) e.g. Europe/Brussels',
    }),
    skipBasename: Flags.boolean({
      char: 'b',
      description: 'skip the basename of the file',
    }),
    time: Flags.boolean({
      char: 't',
      description:
        'fallback to the time of the file when no date and time is found',
      default: false,
    }),
    srt: Flags.boolean({
      description:
        'rename .srt files with the same date as the video they share their name with.',
      default: false,
    }),
  }

  static args = [
    {
      name: 'path',
      description: 'path to file or directory to process',
      required: true,
    },
  ]

  async run() {
    const {
      args: {path},
      flags,
    } = await this.parse(ExifDatify)

    const service = new DatifyService({
      dryRun: flags.dryRun,
      prefix: flags.prefix,
      skipBasename: flags.skipBasename,
      timeZone: flags.zone,
      fileTimeFallback: flags.time,
      srt: flags.srt,
    })

    if (!fs.existsSync(path)) {
      this.error(`${path} does not exist.`)
    }

    if (await isDirectory(path)) {
      const filesToProcess = []

      for await (const d of await fs.promises.opendir(path)) {
        const entry = nodePath.join(path, d.name)
        if (!d.isDirectory()) {
          filesToProcess.push(entry)
        }
      }

      this.log(`${filesToProcess.length} files to process`)
      let index = 1
      for (const entry of filesToProcess) {
        try {
          this.log(`${index}/${filesToProcess.length} - ${entry}`)
          await service.processFile(entry)
        } catch (error) {
          this.log(chalk.red(`Error while processing file: ${entry}: ${error}`))
        }
        index++
      }
    } else {
      await service.processFile(path)
    }
  }
}
