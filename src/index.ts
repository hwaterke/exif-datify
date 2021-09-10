import {Command, flags} from '@oclif/command'

class ExifDatify extends Command {
  static description =
    'rename files with date and time information from Exif data'

  static flags = {
    version: flags.version({char: 'v'}),
    help: flags.help({char: 'h'}),
  }

  static args = [{name: 'file', required: true}]

  async run() {
    const {args, flags} = this.parse(ExifDatify)
    this.log(`Hello World`)
  }
}

export = ExifDatify
