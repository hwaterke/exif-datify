import {promisify} from 'node:util'
import {exec as callbackExec} from 'node:child_process'
import {
  ensureFile,
  EXIF_DATE_TIME_FORMAT,
  EXIF_DATE_TIME_FORMAT_WITH_TZ,
  EXIF_DATE_TIME_REGEX,
  EXIF_DATE_TIME_WITH_TZ_REGEX,
  TZ_OFFSET_REGEX,
} from './utils'
import {DateTime} from 'luxon'

const exec = promisify(callbackExec)

type ExiftoolServiceConfig = {
  debug: boolean
}

export class ExiftoolService {
  constructor(private config: ExiftoolServiceConfig) {}

  /**
   * Returns the exif metadata stored on the file provided
   */
  async extractExifMetadata(path: string): Promise<Record<string, string>> {
    await ensureFile(path)
    const rawResult = await this.exiftool(`-G0:1 -json "${path}"`)
    return JSON.parse(rawResult)[0]
  }

  /**
   * Returns the time related exif metadata stored on the file provided
   */
  async extractTimeExifMetadata(
    path: string
  ): Promise<Record<string, string | number>> {
    await ensureFile(path)
    const rawResult = await this.exiftool(
      `-Time:All -api QuickTimeUTC -G0:1 -json "${path}"`
    )
    return JSON.parse(rawResult)[0]
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
    }
  ) {
    // QuickTime CreationDate is set on Apple videos. As it contains the TZ it is the most complete field possible.
    await ensureFile(path)

    if (!EXIF_DATE_TIME_WITH_TZ_REGEX.test(time)) {
      throw new Error(
        `Invalid time provided ${time}. Please use ${EXIF_DATE_TIME_WITH_TZ_REGEX}`
      )
    }

    await this.exiftool(
      `${
        options.override ? '-overwrite_original' : ''
      } -P -api QuickTimeUTC -quicktime:CreationDate="${time}" "${path}"`
    )
  }

  /**
   * Sets all the times to the provided time.
   * Also changes the file attributes to be in sync.
   */
  async setAllTime(
    path: string,
    time: string,
    options: {
      override: boolean
    }
  ) {
    await ensureFile(path)

    if (!EXIF_DATE_TIME_WITH_TZ_REGEX.test(time)) {
      throw new Error(
        `Invalid time provided ${time}. Please use ${EXIF_DATE_TIME_WITH_TZ_REGEX}`
      )
    }

    await this.exiftool(
      `${
        options.override ? '-overwrite_original' : ''
      } -api QuickTimeUTC -wm w -time:all="${time}" -FileCreateDate="${time}" -FileModifyDate="${time}" "${path}"`
    )
  }

  /**
   * Sets the time zone offset in the exif data (for photos)
   */
  async setTimezoneOffsets(
    path: string,
    offset: string,
    options: {
      override: boolean
    }
  ) {
    await ensureFile(path)

    if (!TZ_OFFSET_REGEX.test(offset)) {
      throw new Error(
        `Invalid offset provided ${offset}. Please use ${EXIF_DATE_TIME_WITH_TZ_REGEX}`
      )
    }

    await this.exiftool(
      `${
        options.override ? '-overwrite_original' : ''
      } -OffsetTime="${offset}" -OffsetTimeOriginal="${offset}" -OffsetTimeDigitized="${offset}" "${path}"`
    )
  }

  async exiftool(command: string) {
    const fullCommand = `exiftool ${command}`

    if (this.config.debug) {
      console.log(fullCommand)
    }

    const {stdout} = await exec(fullCommand)
    return stdout
  }
}
