import {Args, Command, Flags} from '@oclif/core'
import {
  EXIF_DATE_TIME_FORMAT_WITH_TZ,
  EXIF_TAG_FILE_MODIFICATION_DATE,
  EXIF_TAG_QUICKTIME_CREATE_DATE,
  forEachFile,
} from '../utils'
import nodePath from 'node:path'
import {ExiftoolService} from '../ExiftoolService'
import {DateTime} from 'luxon'

/**
 * Fixes time of all files in a directory shifted by one or two hours.
 * Only processes MP4 and MOV files
 * It assumes the file time is correct and the quicktime (metadata) time is wrong
 */
export default class DjiShiftCommand extends Command {
  static description =
    'shifts the time of all files in a directory by one/two hour'

  static flags = {
    dryRun: Flags.boolean({
      char: 'd',
      description: 'dry run',
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
    } = await this.parse(DjiShiftCommand)

    const exifService = new ExiftoolService({debug: true})

    await forEachFile({
      path,
      callback: async (entry) => {
        const ext = nodePath.extname(entry).toUpperCase()

        if (!['.MP4', '.MOV'].includes(ext)) {
          this.log(`Skipping file with ext ${ext}`)
          return
        }

        const metadata = await exifService.extractTimeExifMetadata(entry)
        const fileTime = metadata[EXIF_TAG_FILE_MODIFICATION_DATE] as string
        const quicktimeTime = metadata[EXIF_TAG_QUICKTIME_CREATE_DATE] as string

        if (quicktimeTime === undefined || quicktimeTime === null) {
          throw new Error('No quicktime create date')
        }

        const luxonFileTime = DateTime.fromFormat(
          fileTime,
          EXIF_DATE_TIME_FORMAT_WITH_TZ
        )
        const luxonQuickTimeTime = DateTime.fromFormat(
          quicktimeTime,
          EXIF_DATE_TIME_FORMAT_WITH_TZ
        )

        // Check the difference between file time and exif time
        const msDifference =
          luxonQuickTimeTime.toMillis() - luxonFileTime.toMillis()
        const exactHourDifference = msDifference / 3_600_000
        const roundHourDifference = Math.round(exactHourDifference)

        console.log({
          quicktime: quicktimeTime,
          filetime: fileTime,
          msDifference,
          secondDifference: msDifference / 1000,
          minuteDifference: msDifference / 1000 / 60,
          roundHourDifference,
        })

        if (msDifference === 0) {
          this.log('Dates match perfectly, nothing to do')
          return
        }

        if (Math.abs(exactHourDifference - roundHourDifference) > 0.1) {
          throw new Error(
            'Difference does not seem to be close to an exact number of hours'
          )
        }

        if (roundHourDifference === 1 || roundHourDifference === 2) {
          this.log(
            `Classic DJI problem of one/two hours ahead. Difference: ${msDifference}ms (${
              msDifference / 1000 / 60
            }min)`
          )

          const correctTimeString = luxonQuickTimeTime
            .minus({hours: roundHourDifference})
            .toFormat(EXIF_DATE_TIME_FORMAT_WITH_TZ)

          console.log({correctTimeString})

          if (!flags.dryRun) {
            await exifService.setQuickTimeCreationDate(
              entry,
              correctTimeString,
              {
                override: true,
              }
            )

            await exifService.setAllTime(entry, correctTimeString, {
              override: true,
              file: false,
            })
          }

          const metadataAfter = await exifService.extractTimeExifMetadata(entry)
          console.log({metadata, metadataAfter})
        } else if (roundHourDifference === 0 && msDifference <= 5 * 60 * 1000) {
          // Just less than 5 minutes difference
          this.log('Close enough, nothing to do')
        } else {
          throw new Error('Unexpected difference')
        }
      },
      log: (message) => this.log(message),
      videosLast: false,
    })
  }
}
