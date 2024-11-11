import {Args, Command, Flags} from '@oclif/core'
import {ExiftoolService} from '@hwaterke/media-probe'
import {
  EXIF_DATE_TIME_FORMAT,
  EXIF_DATE_TIME_FORMAT_WITH_TZ,
  forEachFile,
} from '../utils.js'
import nodePath from 'node:path'
import {EXIF_TAGS} from '../types/exif.js'
import {DateTime} from 'luxon'
import {Logger} from '../Logger.js'

export default class GoProCommand extends Command {
  static description = 'write proper time for gopro files'

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
    } = await this.parse(GoProCommand)

    const exifService = new ExiftoolService({logger: Logger})

    await forEachFile({
      path,
      recursive: false,
      callback: async (entry) => {
        const ext = nodePath.extname(entry).toUpperCase()

        if (!['.MOV', '.MP4'].includes(ext)) {
          this.log(`Skipping file with ext ${ext}`)
          return
        }

        const metadata = await exifService.extractExifMetadata(entry)

        const goProModel = metadata[EXIF_TAGS.GOPRO_MODEL]
        // Stop if the file is not a GoPro file
        if (!goProModel) {
          this.log(`Skipping file - Not a GoPro file`)
          return
        }

        // Stop if the file was already fixed. CreationDate is not written by GoPro cameras, we write it when we fix the file
        const quicktimeCreationDate =
          metadata[EXIF_TAGS.QUICKTIME_CREATION_DATE]
        if (quicktimeCreationDate) {
          this.log(`Skipping file - Already fixed`)
          return
        }

        const quicktimeTime = metadata[EXIF_TAGS.QUICKTIME_CREATE_DATE]
        if (quicktimeTime === undefined) {
          throw new Error('No quicktime create date')
        }

        console.log(`Current GoPro Create Date: ${quicktimeTime}`)

        const luxonQuickTimeTime = DateTime.fromFormat(
          quicktimeTime,
          EXIF_DATE_TIME_FORMAT,
          {
            zone: flags.zone,
          }
        )

        const correctTimeString = luxonQuickTimeTime.toFormat(
          EXIF_DATE_TIME_FORMAT_WITH_TZ
        )

        console.log(`Corrected GoPro Creation Date: ${correctTimeString}`)

        if (!flags.dryRun) {
          await exifService.setQuickTimeCreationDate(entry, correctTimeString, {
            ignoreMinorErrors: true,
            override: true,
          })

          await exifService.setAllTime(entry, correctTimeString, {
            ignoreMinorErrors: true,
            override: true,
            file: false,
          })
        }
      },
      log: (message) => this.log(message),
      videosLast: false,
    })
  }
}
