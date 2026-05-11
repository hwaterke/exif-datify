import {promises as fs} from 'node:fs'
import path from 'node:path'

type ExistingDestinationMode = 'skip' | 'suffix'

interface MoveFileOptions {
  /**
   * What to do if a file with the same name already exists in the destination folder.
   *
   * - "skip": do not move the file, return skipped result
   * - "suffix": move as "file_1.ext", "file_2.ext", etc.
   */
  ifExists: ExistingDestinationMode
}

type MoveFileResult =
  | {
      moved: true
      skipped: false
      sourcePath: string
      destinationPath: string
    }
  | {
      moved: false
      skipped: true
      sourcePath: string
      destinationPath: string
      reason: 'destination_exists'
    }

export async function moveFileIntoFolder(
  sourcePath: string,
  destinationFolder: string,
  options: MoveFileOptions
): Promise<MoveFileResult> {
  const source = path.resolve(sourcePath)
  const destination = path.resolve(destinationFolder)

  const sourceStat = await fs.stat(sourcePath)

  if (!sourceStat.isFile()) {
    throw new Error(`Source is not a file: ${sourcePath}`)
  }

  await fs.mkdir(destinationFolder, {recursive: true})

  const fileName = path.basename(sourcePath)

  let destinationPath = path.join(destinationFolder, fileName)

  if (options.ifExists === 'skip') {
    if (await pathExists(destinationPath)) {
      return {
        moved: false,
        skipped: true,
        sourcePath,
        destinationPath,
        reason: 'destination_exists',
      }
    }
  } else if (options.ifExists === 'suffix') {
    destinationPath = await getAvailableSuffixedPath(destinationPath)
  } else {
    throw new Error(
      `Unsupported ifExists option: ${options.ifExists satisfies never}`
    )
  }

  await moveAcrossDevicesSafe(sourcePath, destinationPath)

  return {
    moved: true,
    skipped: false,
    sourcePath,
    destinationPath,
  }
}

async function moveAcrossDevicesSafe(
  sourcePath: string,
  destinationPath: string
): Promise<void> {
  try {
    await fs.rename(sourcePath, destinationPath)
  } catch (error) {
    if (isNodeError(error) && error.code === 'EXDEV') {
      await fs.copyFile(sourcePath, destinationPath)
      await fs.unlink(sourcePath)
      return
    }

    throw error
  }
}

async function getAvailableSuffixedPath(originalPath: string): Promise<string> {
  if (!(await pathExists(originalPath))) {
    return originalPath
  }

  const directory = path.dirname(originalPath)
  const extension = path.extname(originalPath)
  const baseName = path.basename(originalPath, extension)

  let counter = 1

  while (true) {
    const candidatePath = path.join(
      directory,
      `${baseName}_${counter}${extension}`
    )

    if (!(await pathExists(candidatePath))) {
      return candidatePath
    }

    counter += 1
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}
