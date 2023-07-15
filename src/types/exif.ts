export const EXIF_TAGS = {
  FILE_MODIFICATION_DATE: 'File:System:FileModifyDate',
  DATE_TIME_ORIGINAL: 'EXIF:ExifIFD:DateTimeOriginal',
  QUICKTIME_CREATE_DATE: 'QuickTime:CreateDate',
  QUICKTIME_CREATION_DATE: 'QuickTime:Keys:CreationDate',
  GOPRO_MODEL: 'QuickTime:GoPro:Model',
  LIVE_PHOTO_UUID_PHOTO: 'MakerNotes:Apple:MediaGroupUUID',
  LIVE_PHOTO_UUID_VIDEO: 'QuickTime:Keys:ContentIdentifier',
} as const

export type ExiftoolMetadata = {
  [EXIF_TAGS.FILE_MODIFICATION_DATE]?: string
  [EXIF_TAGS.DATE_TIME_ORIGINAL]?: string
  [EXIF_TAGS.QUICKTIME_CREATE_DATE]?: string
  [EXIF_TAGS.QUICKTIME_CREATION_DATE]?: string
  [EXIF_TAGS.GOPRO_MODEL]?: string
  [EXIF_TAGS.LIVE_PHOTO_UUID_PHOTO]?: string
  [EXIF_TAGS.LIVE_PHOTO_UUID_VIDEO]?: string
  [key: string]: string | number | undefined
}
