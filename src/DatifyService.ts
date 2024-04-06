import {ensureFile} from './utils.js'
import {DateTime} from 'luxon'
import * as nodePath from 'node:path'
import chalk from 'chalk'
import {constants} from 'node:fs'
import {access, opendir, rename} from 'node:fs/promises'
import {EXIF_TAGS} from './types/exif.js'
import {ExiftoolService} from '@hwaterke/media-probe'

export type DatifyConfig = {
  prefix: string
  dryRun: boolean
  skipBasename: boolean
  timeZone?: string
  fileTimeFallback: boolean
  srt: boolean
  livePhotoInfix: string | null
}

export class DatifyService {
  exiftoolService = new ExiftoolService({debug: true})
  liveVideoCache: Record<string, DateTime | null> = {}

  constructor(private config: DatifyConfig) {}

  async processFile(path: string) {
    const metadata = await this.exiftoolService.extractExifMetadata(path)

    const livePhotoTargetUuid = metadata[EXIF_TAGS.LIVE_PHOTO_UUID_VIDEO]
    const livePhotoWhen = livePhotoTargetUuid
      ? this.liveVideoCache[livePhotoTargetUuid]
      : null

    const isoDateTimeFromExif = this.exiftoolService.extractDateTimeFromExif({
      metadata,
      timeZone: this.config.timeZone,
      fileTimeFallback: this.config.fileTimeFallback,
    })

    const when =
      livePhotoWhen ??
      (isoDateTimeFromExif ? DateTime.fromISO(isoDateTimeFromExif) : null)

    // If it is an Apple photo. Store the time of the photo to be reused when prefixing the related live video.
    const livePhotoUuid = metadata[EXIF_TAGS.LIVE_PHOTO_UUID_PHOTO]
    if (livePhotoUuid) {
      this.liveVideoCache[livePhotoUuid] = when
    }

    if (when !== null) {
      await this.prefixFileWithDate(
        path,
        when,
        livePhotoTargetUuid ? this.config.livePhotoInfix : null
      )
      if (this.config.srt) {
        await this.renameSrtFile(
          path,
          when,
          livePhotoTargetUuid ? this.config.livePhotoInfix : null
        )
      }
    }
  }

  private async getPrefixedFilename(path: string, prefix: string) {
    const pathData = nodePath.parse(path)
    let counter = 0

    while (true) {
      const newPath = nodePath.join(
        pathData.dir,
        `${prefix}${this.config.skipBasename ? '' : pathData.name}${
          counter > 0 ? counter : ''
        }${pathData.ext}`
      )
      try {
        await access(newPath, constants.F_OK)
        counter += 1
      } catch {
        return newPath
      }
    }
  }

  private async prefixFileWithDate(
    path: string,
    date: DateTime,
    infix: string | null
  ) {
    const current = nodePath.resolve(path)
    const prefix = `${date.toFormat(this.config.prefix)}${infix ?? ''}`

    // Ignore the file if it is already prefixed
    if (nodePath.basename(path).startsWith(prefix)) {
      console.log(chalk.yellow(`${current} already prefixed`))
      return
    }

    const prefixed = await this.getPrefixedFilename(current, prefix)

    console.log(chalk.blue(current))
    console.log(chalk.green(prefixed))

    if (!this.config.dryRun) {
      await rename(current, prefixed)
    }
  }

  private async findSrtFiles(originalFile: string): Promise<string[]> {
    const parsedFile = nodePath.parse(originalFile)
    const srt = nodePath.join(parsedFile.dir, `${parsedFile.name}.srt`)

    const result: string[] = []
    for await (const d of await opendir(parsedFile.dir)) {
      const entry = nodePath.join(parsedFile.dir, d.name)
      if (entry.toLowerCase() === srt.toLowerCase()) {
        result.push(entry)
      }
    }
    return result
  }

  private async renameSrtFile(
    originalFile: string,
    date: DateTime,
    infix: string | null
  ) {
    const srtFiles = await this.findSrtFiles(originalFile)
    for (const srtFile of srtFiles) {
      try {
        await ensureFile(srtFile)
        await this.prefixFileWithDate(srtFile, date, infix)
      } catch {
        // Ignore and move on
      }
    }
  }
}
