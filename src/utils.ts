import fs, {promises as FS, constants} from 'node:fs'
import nodePath from 'node:path'
import chalk from 'chalk'
import {opendir, readdir, stat} from 'node:fs/promises'

export const EXIF_DATE_TIME_FORMAT = 'yyyy:MM:dd HH:mm:ss'
export const EXIF_DATE_TIME_FORMAT_WITH_TZ = 'yyyy:MM:dd HH:mm:ssZZ'
export const EXIF_DATE_TIME_SUBSEC_FORMAT_WITH_TZ = 'yyyy:MM:dd HH:mm:ss.uuZZ'
export const EXIF_OFFSET_FORMAT = 'ZZ'

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

type WalkCallback = (path: string) => Promise<{stop: boolean}>

export const walkDirInOrder = async (
  path: string,
  callback: (path: string) => Promise<void>
) => {
  // Get the files as an array
  const files = await readdir(path)

  // Sort files in alphabetical order
  files.sort()

  // Iterate over the files
  for (const file of files) {
    // Get the absolute path of the file
    const filePath = nodePath.join(path, file)

    // Stat the file to see if we have a file or dir
    const fileStat = await stat(filePath)

    if (fileStat.isFile()) {
      await callback(filePath)
    } else if (fileStat.isDirectory()) {
      await walkDirInOrder(filePath, callback) // Dive into the directory
    }
  }
}

export const walkDir = async (
  path: string,
  callback: WalkCallback
): Promise<void> => {
  let shouldStop = false

  const recursiveWalk = async (directoryPath: string) => {
    const dir = await opendir(directoryPath)
    for await (const dirent of dir) {
      const filepath = nodePath.join(directoryPath, dirent.name)

      if (shouldStop) {
        return
      }

      if (dirent.isDirectory() && !dirent.isSymbolicLink()) {
        await recursiveWalk(filepath)
      } else if (dirent.isFile()) {
        shouldStop = (await callback(filepath)).stop
      }
    }
  }

  await recursiveWalk(path)
}

export const walkDirOrFile = async (
  path: string,
  callback: WalkCallback
): Promise<void> => {
  const stats = await stat(path)
  await (stats.isDirectory() ? walkDir(path, callback) : callback(path))
}

export const forEachFile = async ({
  path,
  log,
  callback,
  videosLast,
  recursive,
}: {
  path: string
  callback: (file: string) => Promise<void>
  log: (message: string) => void
  videosLast: boolean
  recursive: boolean
}) => {
  if (!fs.existsSync(path)) {
    throw new Error(`${path} does not exist.`)
  }

  if (await isDirectory(path)) {
    const filesToProcess = []

    if (recursive) {
      await walkDir(path, async (entry) => {
        filesToProcess.push(entry)
        return {stop: false}
      })
    } else {
      for await (const d of await fs.promises.opendir(path)) {
        const entry = nodePath.join(path, d.name)
        if (!d.isDirectory()) {
          filesToProcess.push(entry)
        }
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
