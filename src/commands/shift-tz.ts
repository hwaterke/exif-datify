import {Command} from '@oclif/core'
import {
  EXIF_DATE_TIME_FORMAT,
  EXIF_DATE_TIME_FORMAT_WITH_TZ,
  EXIF_DATE_TIME_REGEX,
  EXIF_TAG_DATE_TIME_ORIGINAL,
  EXIF_TAG_FILE_MODIFICATION_DATE,
  EXIF_TAG_QUICKTIME_CREATE_DATE,
  forEachFile,
} from '../utils'
import nodePath from 'node:path'
import {ExiftoolService} from '../ExiftoolService'
import {DateTime, Zone} from 'luxon'

export class ShiftTzCommand extends Command {
  static description = 'Shift tz'

  static args = [
    {
      name: 'path',
      description: 'path to file or directory to process',
      required: true,
    },
  ]

  async video({
    exifService,
    entry,
  }: {
    exifService: ExiftoolService
    entry: string
  }) {
    console.log(`Video ${entry}`)
    const metadata = await exifService.extractTimeExifMetadata(entry)
    const quicktimeTime = metadata[EXIF_TAG_QUICKTIME_CREATE_DATE] as string

    if (quicktimeTime === undefined || quicktimeTime === null) {
      throw new Error('No quicktime create date')
    }

    console.log({metadata, quicktimeTime})

    const luxonTime = DateTime.fromFormat(
      quicktimeTime,
      EXIF_DATE_TIME_FORMAT_WITH_TZ,
      {zone: 'Europe/Lisbon'}
    )

    const correctTimeString = luxonTime.toFormat(EXIF_DATE_TIME_FORMAT_WITH_TZ)

    console.log({correctTimeString})

    await exifService.setQuickTimeCreationDate(entry, correctTimeString, {
      override: true,
    })

    await exifService.setAllTime(entry, correctTimeString, {
      override: true,
    })

    const metadataAfter = await exifService.extractTimeExifMetadata(entry)
    console.log({metadata, metadataAfter})
  }

  async run() {
    const {
      args: {path},
    } = await this.parse(ShiftTzCommand)

    const exifService = new ExiftoolService({debug: true})

    await forEachFile({
      path,
      callback: async (entry) => {
        const ext = nodePath.extname(entry)

        if (!['.JPG', '.DNG', '.MP4'].includes(ext)) {
          console.log('Skipping file with ext', ext)
          return
        }

        if (ext === '.MP4') {
          await this.video({
            exifService,
            entry,
          })
          return
        }

        const metadata = await exifService.extractTimeExifMetadata(entry)
        const dateTimeOriginal = metadata[EXIF_TAG_DATE_TIME_ORIGINAL] as string

        if (!EXIF_DATE_TIME_REGEX.test(dateTimeOriginal)) {
          throw new Error('Not here')
        }

        const luxonTime = DateTime.fromFormat(
          dateTimeOriginal,
          EXIF_DATE_TIME_FORMAT,
          {zone: 'Europe/Lisbon'}
        ).minus({hours: 1})

        const correctTimeString = luxonTime.toFormat(
          EXIF_DATE_TIME_FORMAT_WITH_TZ
        )

        // Set the TZ
        await exifService.setTimezoneOffsets(entry, '+00:00', {override: true})

        // Set that time !
        await exifService.setAllTime(entry, correctTimeString, {
          override: true,
        })

        // // Set subsec
        // const subSec = metadata['EXIF:ExifIFD:SubSecTime']
        // if (typeof subSec === 'number') {
        //   await exifService.exiftool(
        //     `-overwrite_original -P -SubSecTime=${subSec} -SubSecTimeOriginal=${subSec} -SubSecTimeDigitized=${subSec} "${entry}"`
        //   )
        // }

        const metadataAfter = await exifService.extractTimeExifMetadata(entry)

        console.log({metadata, metadataAfter})

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
