import {extractDateTimeFromExif, extractExifMetadata} from './utils'
import {DateTime} from 'luxon'
import * as nodePath from 'path'
import * as chalk from 'chalk'
import {constants} from 'fs'
import {access, rename} from 'fs/promises'

export type DatifyConfig = {
  prefix: string
  dryRun: boolean
  skipBasename: boolean
}

export class DatifyService {
  constructor(private config: DatifyConfig) {}

  async processFile(path: string) {
    const metadata = await extractExifMetadata(path)
    const when = extractDateTimeFromExif(metadata)

    if (when !== null) {
      await this.prefixFileWithDate(path, when)
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
      } catch (e) {
        return newPath
      }
    }
  }

  private async prefixFileWithDate(path: string, date: DateTime) {
    const current = nodePath.resolve(path)
    const prefix = date.toFormat(this.config.prefix)

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
}
