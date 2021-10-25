import {extractDateTimeFromExif, extractExifMetadata} from './utils'
import {DateTime} from 'luxon'
import * as nodePath from 'path'
import * as chalk from 'chalk'
import {constants} from 'fs'
import {access, rename} from 'fs/promises'

export type DatifyConfig = {
  prefix: string
  dryRun: boolean
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

  private async prefixFileWithDate(path: string, date: DateTime) {
    const current = nodePath.resolve(path)
    const dirname = nodePath.dirname(current)
    const prefix = date.toFormat(this.config.prefix)

    // Ignore the file if it is already prefixed
    if (nodePath.basename(path).startsWith(prefix)) {
      console.log(chalk.yellow(`${current} already prefixed`))
      return
    }

    let prefixed = nodePath.join(dirname, `${prefix}${nodePath.basename(path)}`)
    let counter = 1

    // Does the file already exist?
    while (true) {
      try {
        await access(prefixed, constants.F_OK)

        counter++
        const parsedPath = nodePath.parse(path)
        prefixed = nodePath.join(
          dirname,
          `${prefix}${parsedPath.name}${counter}${parsedPath.ext}`
        )
      } catch (err) {
        break
      }
    }

    console.log(chalk.blue(current))
    console.log(chalk.green(prefixed))

    if (!this.config.dryRun) {
      await rename(current, prefixed)
    }
  }
}
