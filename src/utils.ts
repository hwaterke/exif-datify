import fs, {constants, promises as FS} from 'node:fs'
import {DateTime} from 'luxon'
import nodePath from 'node:path'
import chalk from 'chalk'
import {EXIF_TAGS, ExiftoolMetadata} from './types/exif'

export const TZ_OFFSET_REGEX = /^[+-]\d{2}:\d{2}$/
export const EXIF_DATE_TIME_REGEX = /^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}$/
export const EXIF_DATE_TIME_WITH_TZ_REGEX =
  /^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/

export const EXIF_DATE_TIME_FORMAT = 'yyyy:MM:dd HH:mm:ss'
export const EXIF_DATE_TIME_FORMAT_WITH_TZ = 'yyyy:MM:dd HH:mm:ssZZ'

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

export const forEachFile = async ({
  path,
  log,
  callback,
  videosLast,
}: {
  path: string
  callback: (file: string) => Promise<void>
  log: (message: string) => void
  videosLast: boolean
}) => {
  if (!fs.existsSync(path)) {
    throw new Error(`${path} does not exist.`)
  }

  if (await isDirectory(path)) {
    const filesToProcess = []

    for await (const d of await fs.promises.opendir(path)) {
      const entry = nodePath.join(path, d.name)
      if (!d.isDirectory()) {
        filesToProcess.push(entry)
      }
    }

    // Put videos last if necessary
    if (videosLast) {
      const isVideo = (extension: string) =>
        extension === '.mp4' || extension === '.mov'

      filesToProcess.sort((a, b) => {
        const extA = nodePath.extname(a).toLowerCase()
        const extB = nodePath.extname(b).toLowerCase()

        if (isVideo(extA) && !isVideo(extB)) {
          return 1
        }
        if (isVideo(extB) && !isVideo(extA)) {
          return -1
        }
        if (extA < extB) {
          return -1
        }
        if (extA > extB) {
          return 1
        }
        return 0
      })
    }

    log(`${filesToProcess.length} files to process`)
    let index = 1
    for (const entry of filesToProcess) {
      try {
        log(`${index}/${filesToProcess.length} - ${entry}`)
        await callback(entry)
      } catch (error) {
        log(chalk.red(`Error while processing file: ${entry}: ${error}`))
      }
      index++
    }
  } else {
    await callback(path)
  }
}

/**
 * Find the shooting date from the exif metadata provided
 */
export const extractDateTimeFromExif = ({
  metadata,
  timeZone,
  fileTimeFallback,
}: {
  metadata: ExiftoolMetadata
  timeZone?: string
  fileTimeFallback: boolean
}): DateTime | null => {
  // DateTimeOriginal is the ideal tag to extract from.
  // It is the local date where the media was taken (in terms of TZ)
  const dateTimeOriginal = metadata[EXIF_TAGS.DATE_TIME_ORIGINAL]
  if (dateTimeOriginal) {
    const date = DateTime.fromFormat(dateTimeOriginal, EXIF_DATE_TIME_FORMAT)
    if (date.isValid) {
      return date
    }
  }

  // Creation date is the ideal tag for videos as it contains the timezone offset.
  const creationDate = metadata[EXIF_TAGS.QUICKTIME_CREATION_DATE]
  if (creationDate) {
    const date = DateTime.fromFormat(
      creationDate,
      EXIF_DATE_TIME_FORMAT_WITH_TZ
    )
    if (date.isValid) {
      return date
    }
  }

  // CreateDate is not as good because it is stored in UTC (per specification).
  // Some companies still store local date time despite the spec e.g. GoPro
  const createDate = metadata[EXIF_TAGS.QUICKTIME_CREATE_DATE]
  if (createDate) {
    if (metadata[EXIF_TAGS.GOPRO_MODEL]) {
      const date = DateTime.fromFormat(createDate, EXIF_DATE_TIME_FORMAT)
      if (date.isValid) {
        return date
      }
    } else {
      // Assuming UTC
      const date = DateTime.fromFormat(createDate, EXIF_DATE_TIME_FORMAT, {
        zone: 'utc',
      })

      if (date.isValid) {
        return timeZone ? date.setZone(timeZone) : date.toLocal()
      }
    }
  }

  if (fileTimeFallback) {
    const fileModifyDate = metadata[EXIF_TAGS.FILE_MODIFICATION_DATE]
    if (fileModifyDate) {
      const date = DateTime.fromFormat(
        fileModifyDate,
        EXIF_DATE_TIME_FORMAT_WITH_TZ
      )

      if (date.isValid) {
        return date
      }
    }
  }

  return null
}
