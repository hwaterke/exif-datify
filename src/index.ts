import {Command, flags} from '@oclif/command'
import * as fs from 'fs'
import * as nodePath from 'path'
import {
  extractDateTimeFromExif,
  extractExifMetadata,
  isDirectory,
} from './utils'
import {DateTime} from 'luxon'
import * as chalk from 'chalk'

class ExifDatify extends Command {
  static description =
    'rename files with date and time information from Exif data'

  static flags = {
    version: flags.version({char: 'v'}),
    help: flags.help({char: 'h'}),
    dryRun: flags.boolean({
      char: 'd',
      description: 'show how files would be renamed without doing it',
    }),
    extensions: flags.string({
      char: 'e',
      description:
        'which file extensions to process (comma separated) e.g. (mov,mp4,jpg)',
    }),
  }

  static args = [{name: 'path', required: true}]

  getFilePrefix(date: DateTime) {
    return `${date.toFormat('yyyy-MM-dd_HH-mm-ss_')}`
  }

  async prefixFileWithDate(path: string, date: DateTime, dryRun = false) {
    const current = nodePath.resolve(path)
    const dirname = nodePath.dirname(current)
    const prefix = this.getFilePrefix(date)

    // Ignore the file if it is already prefixed
    if (nodePath.basename(path).startsWith(prefix)) {
      this.log(chalk.yellow(`${current} already prefixed`))
      return
    }

    const prefixed = nodePath.join(
      dirname,
      `${prefix}${nodePath.basename(path)}`
    )

    this.log(chalk.blue(current))
    this.log(chalk.green(prefixed))

    if (!dryRun) {
      await fs.promises.rename(current, prefixed)
    }
  }

  async processFile(
    path: string,
    options: {
      dryRun: boolean
    }
  ) {
    const metadata = await extractExifMetadata(path)
    const when = extractDateTimeFromExif(metadata)
    if (when !== null) {
      await this.prefixFileWithDate(path, when!, options.dryRun)
    }
  }

  async run() {
    const {
      args: {path},
      flags,
    } = this.parse(ExifDatify)

    if (!fs.existsSync(path)) {
      this.error(`${path} does not exist.`)
    }

    if (await isDirectory(path)) {
      const filesToProcess = []

      for await (const d of await fs.promises.opendir(path)) {
        const entry = nodePath.join(path, d.name)
        if (!d.isDirectory()) {
          filesToProcess.push(entry)
        }
      }

      this.log(`${filesToProcess.length} files to process`)
      let index = 1
      for (const entry of filesToProcess) {
        try {
          this.log(`${index}/${filesToProcess.length} - ${entry}`)
          await this.processFile(entry, flags)
        } catch (error) {
          this.log(chalk.red(`Error while processing file: ${entry}: ${error}`))
        }
        index++
      }
    } else {
      await this.processFile(path, flags)
    }
  }
}

export = ExifDatify
