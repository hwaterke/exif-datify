import {Command} from '@oclif/core'
import {
  EXIF_DATE_TIME_FORMAT_WITH_TZ,
  EXIF_TAG_FILE_MODIFICATION_DATE,
  EXIF_TAG_QUICKTIME_CREATE_DATE,
  forEachFile,
} from '../utils'
import nodePath from 'node:path'
import {ExiftoolService} from '../ExiftoolService'

export class DoctorCommand extends Command {
  static description =
    'looks at all time information and proposes fixes when needed'

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
    } = await this.parse(DoctorCommand)

    const exifService = new ExiftoolService({debug: true})

    await forEachFile({
      path,
      callback: async (entry) => {
        const ext = nodePath.extname(entry)
        if (ext !== '.MP4') {
          console.log('Skipping file with ext', ext)
          return
        }

        const metadata = await exifService.extractTimeExifMetadata(entry)

        const fileTime = metadata[EXIF_TAG_FILE_MODIFICATION_DATE]
        const quicktimeTime = metadata[EXIF_TAG_QUICKTIME_CREATE_DATE]

        const msDifference = Number(fileTime) - Number(quicktimeTime)
        const exactHourDifference = msDifference / 3_600_000
        const roundHourDifference = Math.round(exactHourDifference)

        console.log({
          msDifference,
          exactHourDifference,
          roundHourDifference,
        })

        if (msDifference === 0) {
          console.log('Dates match')
          return
        }

        console.log(JSON.stringify(metadata, null, 2))

        if (Math.abs(roundHourDifference - exactHourDifference) < 0.1) {
          console.log('Looks close !')
        } else {
          throw new Error('BIG DIFFERENCE')
        }

        if (roundHourDifference === -1) {
          console.log('Looks like a classic DJI one hour shift')
          const correctTime = quicktimeTime.minus({hour: 1})
          const correctTimeString = correctTime.toFormat(
            EXIF_DATE_TIME_FORMAT_WITH_TZ
          )

          console.log(correctTimeString)

          await exifService.setQuickTimeCreationDate(entry, correctTimeString, {
            override: true,
          })

          await exifService.setAllTime(entry, correctTimeString, {
            override: true,
          })
        } else {
          throw new Error('Unexpected difference')
        }

        // TODOS for footage

        // DJI
        // Set time of DJI videos to their UTC time -1h if it looks like the file time!
        // Set time zones on the DJI photos, then do a setAllTime with time and correct tz (to make sure all is good)

        // Gopro
        // Photo: Set time zones
        // Videos: Set all time to the createdate with tz of +2 + add the creationdate as well with TZ!

        /*
        2022:09:12 19:01:01+02:00

        - Get difference in hours between file and exif

        if very close to integer
          - Propose to shift exif to match file (do not shift but set all with TZ !)
            exiftool -overwrite_original -P -api QuickTimeUTC -wm w -time:all="2022:06:06 17:00:00+02:00" FILE.MP4
            extra option to also add a CreationTime with the TZ !
        else

        - Popose to set file times to match the exif time




         */
      },
      log: (message) => this.log(message),
      videosLast: false,
    })
  }
}
