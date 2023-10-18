import {promisify} from 'node:util'
import {exec as callbackExec} from 'node:child_process'
import {
  ensureFile,
  EXIF_DATE_TIME_FORMAT,
  EXIF_DATE_TIME_FORMAT_WITH_TZ,
  EXIF_DATE_TIME_REGEX,
  EXIF_DATE_TIME_SUBSEC_WITH_TZ_REGEX,
  EXIF_DATE_TIME_WITH_TZ_REGEX,
  TZ_OFFSET_REGEX,
} from './utils'
import {DateTime} from 'luxon'
import {ExiftoolMetadata} from './types/exif'

const exec = promisify(callbackExec)

type ExiftoolServiceConfig = {
  debug: boolean
}

export class ExiftoolService {
  constructor(private config: ExiftoolServiceConfig) {}

  /**
   * Returns the exif metadata stored on the file provided
   */
  async extractExifMetadata(path: string): Promise<ExiftoolMetadata> {
    const rawResult = await this.exiftool({
      args: ['-G0:1', '-json'],
      path,
      options: {
        override: false,
        ignoreMinorErrors: false,
      },
    })
    return JSON.parse(rawResult)[0]
  }

  /**
   * Returns the time related exif metadata stored on the file provided
   */
  async extractTimeExifMetadata(path: string): Promise<ExiftoolMetadata> {
    const rawResult = await this.exiftool({
      args: ['-Time:All', '-api QuickTimeUTC', '-G0:1', '-json'],
      path,
      options: {
        override: false,
        ignoreMinorErrors: false,
      },
    })
    return JSON.parse(rawResult)[0]
  }

  async extractGpsExifMetadata(path: string): Promise<{
    latitude: number
    longitude: number
  } | null> {
    const rawResult = await this.exiftool({
      args: ['-GPSLatitude', '-GPSLongitude', '-json', '-c %.6f'],
      path,
      options: {
        override: false,
        ignoreMinorErrors: false,
      },
    })

    const result = JSON.parse(rawResult)[0]
    const gpsLatitudeStr: string | undefined | null = result.GPSLatitude
    const gpsLongitudeStr: string | undefined | null = result.GPSLongitude
    const gpsLatitudeParts = gpsLatitudeStr?.match(/([\d.]+)\s*([ENSW])/)
    const gpsLongitudeParts = gpsLongitudeStr?.match(/([\d.]+)\s*([ENSW])/)

    if (!gpsLatitudeParts || !gpsLongitudeParts) {
      return null
    }

    const latitude =
      (gpsLatitudeParts[2] === 'S' ? -1 : 1) *
      Number.parseFloat(gpsLatitudeParts[1])
    const longitude =
      (gpsLongitudeParts[2] === 'W' ? -1 : 1) *
      Number.parseFloat(gpsLongitudeParts[1])

    return {
      latitude,
      longitude,
    }
  }

  async extractAndConvertTimeExifMetadata(
    path: string
  ): Promise<Record<string, DateTime>> {
    const rawData = await this.extractTimeExifMetadata(path)

    const ignoredKeys = new Set([
      'SourceFile',
      'File:System:FileAccessDate',
      'File:System:FileInodeChangeDate',
    ])
    const result: Record<string, DateTime> = {}

    for (const key in rawData) {
      if (!ignoredKeys.has(key)) {
        // Parse datetime and add to result
        const value = rawData[key]

        if (typeof value === 'string') {
          if (EXIF_DATE_TIME_REGEX.test(value)) {
            result[key] = DateTime.fromFormat(value, EXIF_DATE_TIME_FORMAT)
            continue
          }
          if (EXIF_DATE_TIME_WITH_TZ_REGEX.test(value)) {
            result[key] = DateTime.fromFormat(
              value,
              EXIF_DATE_TIME_FORMAT_WITH_TZ
            )
            continue
          }
        }
        throw new Error(`Unknown date format for key ${key}: ${value}`)
      }
    }

    return result
  }

  async setQuickTimeCreationDate(
    path: string,
    time: string,
    options: {
      override: boolean
      ignoreMinorErrors: boolean
    }
  ) {
    // QuickTime CreationDate is set on Apple videos. As it contains the TZ it is the most complete field possible.

    if (!EXIF_DATE_TIME_WITH_TZ_REGEX.test(time)) {
      throw new Error(
        `Invalid time provided ${time}. Please use ${EXIF_DATE_TIME_WITH_TZ_REGEX}`
      )
    }

    await this.exiftool({
      args: ['-api QuickTimeUTC', '-P', `-quicktime:CreationDate="${time}"`],
      path,
      options,
    })
  }

  /**
   * Sets all the times to the provided time.
   * Can also change the file attributes to be in sync.
   */
  async setAllTime(
    path: string,
    time: string,
    options: {
      file: boolean
      override: boolean
      ignoreMinorErrors: boolean
    }
  ) {
    if (
      !EXIF_DATE_TIME_WITH_TZ_REGEX.test(time) &&
      !EXIF_DATE_TIME_SUBSEC_WITH_TZ_REGEX.test(time)
    ) {
      throw new Error(
        `Invalid time provided ${time}. Please use ${EXIF_DATE_TIME_WITH_TZ_REGEX} or ${EXIF_DATE_TIME_SUBSEC_WITH_TZ_REGEX}`
      )
    }

    await this.exiftool({
      args: [
        '-api QuickTimeUTC',
        '-wm w',
        `-time:all="${time}"`,
        options.file
          ? `-FileCreateDate="${time}" -FileModifyDate="${time}"`
          : '-P',
      ],
      path,
      options,
    })
  }

  /**
   * Sets the time zone offset in the exif data (for photos)
   */
  async setTimezoneOffsets(
    path: string,
    offset: string,
    options: {
      override: boolean
      ignoreMinorErrors: boolean
    }
  ) {
    if (!TZ_OFFSET_REGEX.test(offset)) {
      throw new Error(
        `Invalid offset provided ${offset}. Please use ${EXIF_DATE_TIME_WITH_TZ_REGEX}`
      )
    }

    await this.exiftool({
      args: [
        '-P',
        `-OffsetTime="${offset}"`,
        `-OffsetTimeOriginal="${offset}"`,
        `-OffsetTimeDigitized="${offset}" "${path}"`,
      ],
      path,
      options,
    })
  }

  async exiftool({
    args,
    path,
    options,
  }: {
    args: string[]
    path: string
    options: {
      override: boolean
      ignoreMinorErrors: boolean
    }
  }) {
    await ensureFile(path)

    return await this.rawExiftool(
      [
        ...(options.override ? ['-overwrite_original'] : []),
        ...(options.ignoreMinorErrors ? ['-m'] : []),
        ...args,
        `"${path}"`,
      ].join(' ')
    )
  }

  private async rawExiftool(command: string) {
    const fullCommand = `exiftool ${command}`

    if (this.config.debug) {
      console.log(fullCommand)
    }

    const {stdout} = await exec(fullCommand)
    return stdout
  }
}
