import {EXIF_TAGS} from '@hwaterke/media-probe'

export type ExiftoolMetadata = {
  [EXIF_TAGS.FILE_MODIFICATION_DATE]?: string
  [EXIF_TAGS.DATE_TIME_ORIGINAL]?: string
  [EXIF_TAGS.QUICKTIME_CREATE_DATE]?: string
  [EXIF_TAGS.QUICKTIME_CREATION_DATE]?: string
  [EXIF_TAGS.GOPRO_MODEL]?: string
  [EXIF_TAGS.LIVE_PHOTO_UUID_PHOTO]?: string
  [EXIF_TAGS.LIVE_PHOTO_UUID_VIDEO]?: string
  [EXIF_TAGS.SUB_SEC_DATE_TIME_ORIGINAL]?: string
  [EXIF_TAGS.GPS_DATE_TIME]?: string
  [key: string]: string | number | undefined
}
