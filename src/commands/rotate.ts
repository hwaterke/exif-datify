import {EXIF_TAGS, ExiftoolService} from '@hwaterke/media-probe'
import {Args, Command, Flags} from '@oclif/core'
import nodePath from 'node:path'
import {Logger} from '../lib/Logger.js'
import {ensureFile} from '../lib/utils.js'

const ORIENTATION_MAP = {
  'Horizontal (normal)': 1,
  'Rotate 90 CW': 6,
  'Rotate 180': 3,
  'Rotate 270 CW': 8,
}

function getOrientation(currentOrientation: number, degrees: number) {
  const sequence = [1, 6, 3, 8]
  const currentIndex = sequence.indexOf(currentOrientation)

  if (currentIndex === -1) {
    throw new Error('Invalid orientation')
  }

  // Normalize negative degrees to positive by adding 360
  const normalizedDegrees = degrees < 0 ? degrees + 360 : degrees
  const shift = Math.floor(normalizedDegrees / 90)

  if (shift === 0 || shift > 3) {
    throw new Error('Invalid shift')
  }

  const newIndex = (currentIndex + shift) % 4
  return sequence[newIndex]
}

export default class RotateCommand extends Command {
  static description = 'rotate images and videos'

  static flags = {
    dryRun: Flags.boolean({
      char: 'd',
      description: 'show how files would be renamed without doing it',
    }),
  }

  static args = {
    path: Args.string({
      name: 'path',
      description: 'path to file or directory to process',
      required: true,
    }),
    degrees: Args.integer({
      name: 'degrees',
      description: 'degrees to rotate the image',
      required: true,
      default: 90,
      min: -270,
      max: 270,
    }),
  }

  async run() {
    const {
      args: {path, degrees},
      flags: {dryRun},
    } = await this.parse(RotateCommand)

    await ensureFile(path)
    const ext = nodePath.extname(path).toUpperCase()

    const exifService = new ExiftoolService({logger: Logger})
    const metadata = await exifService.extractExifMetadata(path)

    if (ext === '.JPG' || ext === '.JPEG' || ext === '.PNG' || ext === '.NEF') {
      const orientation = metadata[EXIF_TAGS.ORIENTATION]

      if (
        orientation === undefined ||
        !ORIENTATION_MAP[orientation as keyof typeof ORIENTATION_MAP]
      ) {
        throw new Error('No orientation found in metadata')
      }

      const newOrientation = getOrientation(
        ORIENTATION_MAP[orientation as keyof typeof ORIENTATION_MAP],
        degrees
      )

      this.log(`Rotating ${path} to ${newOrientation} (was ${orientation})`)
      exifService.setOrientation(path, newOrientation, {
        override: true,
        ignoreMinorErrors: false,
        dryRun,
      })
    }
  }
}
