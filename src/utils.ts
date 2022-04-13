import {promises as FS, constants} from 'node:fs'
import {exec as callbackExec} from 'node:child_process'
import {promisify} from 'node:util'
import {DateTime} from 'luxon'

const exec = promisify(callbackExec)

export const EXIF_DATE_TIME_FORMAT = 'yyyyy:MM:dd HH:mm:ss'

/**
 * Returns true if the provided path is a directory
 */
export const isDirectory = async (path: string) => {
  const stat = await FS.lstat(path)
  return stat.isDirectory()
}

/**
 * Makes sure the provided path is a valid directory
 */
export const ensureDirectory = async (path: string): Promise<void> => {
  if (!(await isDirectory(path))) {
    throw new Error(`${path} is not a directory`)
  }
  await FS.access(path, constants.R_OK)
}

/**
 * Makes sure the provided path is a valid file
 */
export const ensureFile = async (path: string): Promise<void> => {
  if (await isDirectory(path)) {
    throw new Error(`${path} is a directory and not a file`)
  }
  await FS.access(path, constants.F_OK)
}

/**
 * Returns the exif metadata stored on the file provided
 */
export const extractExifMetadata = async (
  path: string
): Promise<Record<string, string>> => {
  await ensureFile(path)
  const {stdout} = await exec(`exiftool -G0:1 -json "${path}"`)
  return JSON.parse(stdout)[0]
}

const EXIF_TAG_DATE_TIME_ORIGINAL = 'EXIF:ExifIFD:DateTimeOriginal'
const EXIF_TAG_QUICKTIME_CREATE_DATE = 'QuickTime:CreateDate'
const EXIF_TAG_GOPRO_MODEL = 'QuickTime:GoPro:Model'

/**
 * Find the shooting date from the exif metadata provided
 */
export const extractDateTimeFromExif = (
  metadata: Record<string, string>,
  timeZone?: string
): DateTime | null => {
  // DateTimeOriginal is the ideal tag to extract from.
  // It is the local date where the media was taken (in terms of TZ)
  if (metadata[EXIF_TAG_DATE_TIME_ORIGINAL]) {
    const date = DateTime.fromFormat(
      metadata[EXIF_TAG_DATE_TIME_ORIGINAL],
      EXIF_DATE_TIME_FORMAT
    )

    if (date.isValid) {
      return date
    }
  }

  // CreateDate is not as good because it is stored in UTC (per specification).
  // Some companies still store local date time despite the spec e.g. GoPro
  if (metadata[EXIF_TAG_QUICKTIME_CREATE_DATE]) {
    if (metadata[EXIF_TAG_GOPRO_MODEL]) {
      const date = DateTime.fromFormat(
        metadata[EXIF_TAG_QUICKTIME_CREATE_DATE],
        EXIF_DATE_TIME_FORMAT
      )
      if (date.isValid) {
        return date
      }
    } else {
      // Assuming UTC
      const date = DateTime.fromFormat(
        metadata[EXIF_TAG_QUICKTIME_CREATE_DATE],
        EXIF_DATE_TIME_FORMAT,
        {zone: 'utc'}
      )

      if (date.isValid) {
        return timeZone ? date.setZone(timeZone) : date.toLocal()
      }
    }
  }

  return null
}
