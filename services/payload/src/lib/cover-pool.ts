import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, mkdir, open, rename, unlink } from 'node:fs/promises'
import path from 'node:path'

export const BUILT_IN_COVERS = Array.from({ length: 21 }, (_, index) => `/img/cover/${index + 1}.webp`)
export const BUILT_IN_COVER_IDS = Array.from({ length: 21 }, (_, index) => index + 1)
export const MAX_POOL_MEDIA = 200
const MAX_CONFIG_BYTES = 16_384
export type CoverPoolSettings = { version: 1; includeBuiltIn: boolean; mediaIds: number[]; builtInIds?: number[] }
export type CoverPoolImage = { id: number; url: string; width?: number; height?: number; alt: string; updatedAt?: string }
export type CoverPoolSnapshot = CoverPoolSettings & { revision: string; covers: string[]; images: CoverPoolImage[] }
export type CoverMedia = { id: number; url?: string | null; mimeType?: string | null; width?: number | null; height?: number | null; alt?: string | null; updatedAt?: string }
export type ReadCoverMedia = (ids: number[]) => Promise<CoverMedia[]>
export class CoverPoolError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}
const digest = (value: string) => createHash('sha256').update(value).digest('hex')
const serialize = (settings: CoverPoolSettings) => `${JSON.stringify(settings)}\n`
const defaultSettings = (): CoverPoolSettings => ({ version: 1, includeBuiltIn: true, mediaIds: [] })
const isMissing = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT'

function validateSettings(value: unknown): CoverPoolSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CoverPoolError('封面设置格式无效。')
  const settings = value as Record<string, unknown>
  if (settings.version !== 1 || typeof settings.includeBuiltIn !== 'boolean' || !Array.isArray(settings.mediaIds) ||
    settings.mediaIds.length > MAX_POOL_MEDIA || settings.mediaIds.some(id => !Number.isSafeInteger(id) || id <= 0) ||
    new Set(settings.mediaIds).size !== settings.mediaIds.length ||
    (settings.builtInIds !== undefined && (!Array.isArray(settings.builtInIds) || settings.builtInIds.length > 21 ||
      settings.builtInIds.some(id => !Number.isInteger(id) || id < 1 || id > 21) || new Set(settings.builtInIds).size !== settings.builtInIds.length)) ||
    Object.keys(settings).some(key => !['version', 'includeBuiltIn', 'mediaIds', 'builtInIds'].includes(key))) {
    throw new CoverPoolError('封面设置格式无效；最多选择200张不重复的媒体图片。')
  }
  if ((!settings.includeBuiltIn || (Array.isArray(settings.builtInIds) && !settings.builtInIds.length)) && !settings.mediaIds.length) throw new CoverPoolError('请至少保留一张默认封面。')
  return { version: 1, includeBuiltIn: settings.includeBuiltIn, mediaIds: settings.mediaIds as number[],
    ...(settings.builtInIds === undefined ? {} : { builtInIds: settings.builtInIds as number[] }) }
}

export function validateCoverPoolPatch(value: unknown): { revision: string; settings: CoverPoolSettings } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CoverPoolError('封面设置格式无效。')
  const patch = value as Record<string, unknown>
  if (typeof patch.revision !== 'string' || !/^[a-f0-9]{64}$/.test(patch.revision) ||
    Object.keys(patch).some(key => !['revision', 'includeBuiltIn', 'mediaIds', 'builtInIds'].includes(key))) throw new CoverPoolError('封面设置版本无效，请重新读取。')
  return { revision: patch.revision, settings: validateSettings({ version: 1, includeBuiltIn: patch.includeBuiltIn, mediaIds: patch.mediaIds, ...(patch.builtInIds === undefined ? {} : { builtInIds: patch.builtInIds }) }) }
}

async function assertDirectory(directory: string) {
  const stat = await lstat(directory)
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new CoverPoolError('封面设置存储不可用。', 503)
}

async function readSettings(directory: string): Promise<{ settings: CoverPoolSettings; revision: string }> {
  try { await assertDirectory(directory) } catch (error) {
    if (!isMissing(error)) throw error
    const settings = defaultSettings(); return { settings, revision: digest(serialize(settings)) }
  }
  let file
  try {
    file = await open(path.join(directory, '.cover-pool.json'), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    const stat = await file.stat()
    if (!stat.isFile() || stat.size > MAX_CONFIG_BYTES) throw new CoverPoolError('封面设置文件无效。', 503)
    const raw = await file.readFile('utf8')
    const settings = validateSettings(JSON.parse(raw))
    return { settings, revision: digest(raw) }
  } catch (error) {
    if (isMissing(error)) { const settings = defaultSettings(); return { settings, revision: digest(serialize(settings)) } }
    throw new CoverPoolError('封面设置暂不可读取，请稍后重试。', 503)
  } finally { await file?.close() }
}

function publicImage(media: CoverMedia): CoverPoolImage | undefined {
  if (!media.url || !media.mimeType?.startsWith('image/')) return undefined
  try {
    const url = new URL(media.url, 'http://cover-pool.invalid')
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash ||
      !url.pathname.startsWith('/api/media/file/')) return undefined
    if (!media.url.startsWith('/') && !/^https?:\/\//.test(media.url)) return undefined
    if (media.url.startsWith('//')) return undefined
  } catch { return undefined }
  return { id: media.id, url: media.url, alt: typeof media.alt === 'string' ? media.alt : '',
    ...(typeof media.updatedAt === 'string' ? { updatedAt: media.updatedAt } : {}),
    ...(typeof media.width === 'number' && media.width > 0 ? { width: media.width } : {}),
    ...(typeof media.height === 'number' && media.height > 0 ? { height: media.height } : {}) }
}

async function snapshot(settings: CoverPoolSettings, revision: string, readMedia: ReadCoverMedia): Promise<CoverPoolSnapshot> {
  const documents = settings.mediaIds.length ? await readMedia(settings.mediaIds) : []
  const byID = new Map(documents.map(media => [media.id, publicImage(media)]))
  const images = settings.mediaIds.flatMap(id => { const image = byID.get(id); return image ? [image] : [] })
  return { ...settings, revision, covers: [...(settings.includeBuiltIn ? (settings.builtInIds ?? BUILT_IN_COVER_IDS).map(id => BUILT_IN_COVERS[id - 1]) : []), ...images.map(image => image.url)], images }
}

export async function readCoverPool(directory: string, readMedia: ReadCoverMedia): Promise<CoverPoolSnapshot> {
  const { settings, revision } = await readSettings(directory)
  return snapshot(settings, revision, readMedia)
}

async function withWriteLock<T>(directory: string, callback: () => Promise<T>): Promise<T> {
  await mkdir(directory, { recursive: true, mode: 0o755 })
  await assertDirectory(directory)
  // Keep the inode: unlinking a lock file could let concurrent writers lock different files.
  const file = await open(path.join(directory, '.cover-pool.lock'),
    constants.O_CREAT | constants.O_RDWR | constants.O_NOFOLLOW | constants.O_NONBLOCK, 0o600)
  try {
    if (!(await file.stat()).isFile()) throw new CoverPoolError('封面设置写锁无效。', 503)
    await file.chmod(0o600)
    await new Promise<void>((resolve, reject) => {
      // flock inherits the SAME open file description as this parent. Its process
      // exits after acquisition; our descriptor retains the kernel lock until close.
      // An OOM, restart or crash closes the descriptor and releases the lock too.
      const child = spawn('flock', ['--exclusive', '--wait', '3', '3'], { stdio: ['ignore', 'ignore', 'ignore', file.fd] })
      const timer = setTimeout(() => child.kill('SIGKILL'), 5000)
      child.once('error', () => { clearTimeout(timer); reject(new CoverPoolError('封面设置写锁不可用。', 503)) })
      child.once('close', code => {
        clearTimeout(timer)
        if (code === 0) resolve()
        else reject(new CoverPoolError('封面设置正在保存，请稍后重试。', 503))
      })
    })
    return await callback()
  } finally { await file.close() }
}

export async function saveCoverPool(directory: string, value: unknown, readMedia: ReadCoverMedia): Promise<CoverPoolSnapshot> {
  const { revision, settings } = validateCoverPoolPatch(value)
  return withWriteLock(directory, async () => {
    const current = await readSettings(directory)
    if (revision !== current.revision) throw new CoverPoolError('封面池已被其他操作更新。请重新读取后再保存；当前选择仍保留。', 409)
    const result = await snapshot(settings, '', readMedia)
    const available = new Set(result.images.map(image => image.id))
    const missing = settings.mediaIds.filter(id => !available.has(id))
    if (missing.length) throw new CoverPoolError(`图片不存在或不可用，请先移除失效图片：${missing.join('、')}。`)
    const raw = serialize(settings)
    const target = path.join(directory, '.cover-pool.json')
    const temporary = path.join(directory, `.cover-pool.${randomUUID()}.tmp`)
    let file
    try {
      file = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600)
      await file.writeFile(raw); await file.sync(); await file.close(); file = undefined
      // Recheck the destination immediately before the atomic replacement.
      try { const stat = await lstat(target); if (!stat.isFile() || stat.isSymbolicLink()) throw new CoverPoolError('封面设置文件无效。', 503) } catch (error) { if (!isMissing(error)) throw error }
      await rename(temporary, target)
      const parent = await open(directory, constants.O_RDONLY | constants.O_DIRECTORY)
      try { await parent.sync() } finally { await parent.close() }
      return { ...result, revision: digest(raw) }
    } finally { await file?.close(); await unlink(temporary).catch(error => { if (!isMissing(error)) throw error }) }
  })
}
