/**
 * Generates the PWA icon set from `public/icon.svg`.
 *
 *   npm run icons
 *
 * Why this exists: the app needs raster icons at sizes the home screen, the
 * Android splash and iOS's `apple-touch-icon` each ask for by name, and it
 * needs them to be *derived* from the one artwork file rather than redrawn per
 * size. A hand-exported set drifts: someone nudges `icon.svg` and the 512 PNG
 * keeps the old mark until somebody notices on a home screen.
 *
 * So the SVG in `public/` stays the single source of truth and this script
 * rasterises it. The mark's geometry is never restated here — it is read out of
 * the SVG, trimmed to its real bounding box with sharp, and composited. The
 * only numbers in this file are sizes and one padding fraction, and both are
 * dictated by a platform.
 *
 * Why the maskable and Apple icons are not just a copy of `icon.svg`:
 *
 *   - A **maskable** icon must fill its whole canvas with background, because
 *     Android crops it to whatever shape the OEM uses. Artwork with rounded
 *     corners shows those corners as stray pixels once the OS cuts deeper, so
 *     the background goes full-bleed and the mark is inset to the safe zone.
 *   - An **apple-touch-icon** is masked by iOS into its own squircle and
 *     renders transparency as *black*. A transparent-cornered icon therefore
 *     gets black corners on iPhone. Same treatment: full-bleed background, let
 *     iOS do the rounding.
 *
 * There is deliberately no `monochrome` icon. Monochrome icons are for themed
 * icons and notification badges, this app sends no notifications, and the mark
 * is two overlapping bars plus a wallet — flattened to one colour those merge
 * into an unreadable blob. Emitting one to look thorough would be worse than
 * omitting it.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const ROOT = process.cwd()
const PUBLIC = path.join(ROOT, 'public')
const OUT = path.join(PUBLIC, 'icons')

/** `--ink-900`, the icon's own background. Also the splash screen's. */
const INK = '#142025'

/**
 * How much of the canvas the mark occupies inside a maskable icon.
 *
 * Android's safe zone is the central 80% of the canvas, but the zone is a
 * *circle*, so a square has to be smaller than that to fit: a square of side
 * `s` fits a circle of diameter `d` only when `s * √2 / 2 <= d / 2`. At 0.8 that
 * is `s <= 0.566`. 0.55 is just inside it, with enough slack that a slightly
 * off-square mark still lands inside.
 */
const MASKABLE_MARK_FRACTION = 0.55

/** The logo as a standalone SVG string, ready to trim and place. */
async function readMark(): Promise<string> {
  const file = path.join(PUBLIC, 'icon.svg')
  const svg = await readFile(file, 'utf8')

  // Lift the shapes out of the SVG document. The background rect is removed by
  // value rather than by position so the script breaks loudly if the artwork is
  // ever reordered, instead of silently producing the wrong icon.
  const withoutBackground = svg.replace(/\s*<rect[^>]*fill="#142025"[^>]*\/>/, '')
  if (withoutBackground === svg) {
    throw new Error(
      'public/icon.svg: no <rect fill="#142025"> background found. ' +
        'This script removes it before compositing; update the pattern here.',
    )
  }

  const inner = withoutBackground
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .trim()

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40" height="40">${inner}</svg>`
}

/**
 * The mark rendered on transparency, cropped to its tight bounding box.
 *
 * The bounding box is measured by scanning the alpha channel rather than by
 * sharp's `trim()`. `trim()` is documented to take its background from the
 * top-left pixel and it is correct on paper, but on this rasteriser it returned
 * the full canvas for an image whose corners were demonstrably `[0,0,0,0]` —
 * silently, with no error. An icon that quietly places the logo off-centre, or
 * crops it, is exactly the kind of defect that reaches a home screen before
 * anyone looks at the code, so the box is computed here instead.
 *
 * Measuring rather than hardcoding the artwork's geometry also means the logo
 * can be redrawn at a different scale inside the same 40×40 viewBox without
 * this script needing to know.
 */
async function tightMark(size: number): Promise<Buffer> {
  const mark = await readMark()
  const { data, info } = await sharp(Buffer.from(mark))
    .resize(size, size, { fit: 'contain' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const { width, height, channels } = info
  let left = width
  let top = height
  let right = -1
  let bottom = -1

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Alpha sits in the last band for RGBA output.
      if (data[(y * width + x) * channels + (channels - 1)] === 0) continue
      if (x < left) left = x
      if (x > right) right = x
      if (y < top) top = y
      if (y > bottom) bottom = y
    }
  }

  if (right < 0) {
    throw new Error(
      'public/icon.svg rendered no visible pixels. The mark is empty, so there is nothing to place.',
    )
  }

  return sharp(data, { raw: info })
    .extract({ left, top, width: right - left + 1, height: bottom - top + 1 })
    .png({ compressionLevel: 9 })
    .toBuffer()
}

/** The full-bleed variant: solid background, centred mark. For maskable + iOS. */
async function fullBleed(size: number, markFraction: number, background: string): Promise<Buffer> {
  const mark = await tightMark(Math.round(size * markFraction))

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background,
    },
  })
    .composite([{ input: mark, gravity: 'centre' }])
    .png({ compressionLevel: 9, palette: true })
    .toBuffer()
}

/**
 * The splash iOS shows while the installed app launches.
 *
 * A flat background rather than the brand gradient, for two reasons. A gradient
 * across 1,290 × 2,796 would have to be stored as a truecolour PNG (a palette
 * PNG bands a gradient visibly), which is where the file weight goes. And iOS
 * centre-crops a startup image to fill the screen in every orientation, so
 * anything but a flat fill has to survive being cropped from every edge.
 *
 * It is the icon's own ink so the app appears to open out of its own icon, and
 * so one file is correct in both colour schemes — a second, light-scheme splash
 * gated on `prefers-color-scheme` would double the file count for a screen that
 * is on screen for a few hundred milliseconds.
 */
async function splash(width: number, height: number): Promise<Buffer> {
  const mark = await tightMark(Math.round(Math.min(width, height) * 0.28))

  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: INK,
    },
  })
    .composite([{ input: mark, gravity: 'centre' }])
    .png({ compressionLevel: 9, palette: true })
    .toBuffer()
}

type Splash = { file: string; width: number; height: number; dpr: number; device: string }

/**
 * The startup-image matrix.
 *
 * iOS matches a startup image by exact media query — width, height and pixel
 * ratio — and silently ignores one that does not match, so this is a list and
 * not a range. It is not exhaustive; it covers the devices this app's audience
 * is likely to be holding. Adding a device is one line here plus the matching
 * `<link>` in `src/app/AppleStartupImages.tsx`, and the pair is kept together
 * deliberately: a generated file with no link, or a link with no file, both fail
 * silently.
 *
 * The iPhone SE entry is there because it is still a common phone at the price
 * this app's users are shopping at, not because it is current.
 */
const SPLASHES: Splash[] = [
  { file: 'iphone-se', width: 375, height: 667, dpr: 2, device: 'iPhone SE, 8' },
  { file: 'iphone-x', width: 375, height: 812, dpr: 3, device: 'iPhone X, XS, 11 Pro' },
  { file: 'iphone-12', width: 390, height: 844, dpr: 3, device: 'iPhone 12, 13, 14' },
  { file: 'iphone-14-pro', width: 393, height: 852, dpr: 3, device: 'iPhone 14 Pro, 15, 16' },
  {
    file: 'iphone-xs-max',
    width: 414,
    height: 896,
    dpr: 3,
    device: 'iPhone XS Max, 11 Pro Max',
  },
  { file: 'iphone-14-plus', width: 428, height: 926, dpr: 3, device: 'iPhone 14 Plus' },
  { file: 'iphone-15-pro-max', width: 430, height: 932, dpr: 3, device: 'iPhone 15 Pro Max' },
  { file: 'ipad-air', width: 820, height: 1180, dpr: 2, device: 'iPad Air 10.9"' },
  { file: 'ipad-pro-11', width: 834, height: 1194, dpr: 2, device: 'iPad Pro 11"' },
  { file: 'ipad-pro-13', width: 1024, height: 1366, dpr: 2, device: 'iPad Pro 12.9"' },
]

/** Sizes iOS asks for by name. */
const APPLE_SIZES = [180, 167, 152, 120]

async function write(name: string, data: Buffer): Promise<number> {
  await writeFile(path.join(OUT, name), data)
  return data.byteLength
}

async function main(): Promise<void> {
  await mkdir(OUT, { recursive: true })

  // `any`-purpose icons are the artwork exactly as drawn, so an unmasked
  // preview (Chrome's install dialog, a bookmark) shows the real mark.
  const svg = await readFile(path.join(PUBLIC, 'icon.svg'))
  const written: string[] = []

  for (const size of [192, 512]) {
    const name = `icon-${size}.png`
    const bytes = await write(
      name,
      await sharp(svg).resize(size, size).png({ compressionLevel: 9 }).toBuffer(),
    )
    written.push(`${name} ${size}×${size} ${bytes}b`)
  }

  {
    const name = 'maskable-512.png'
    const bytes = await write(name, await fullBleed(512, MASKABLE_MARK_FRACTION, INK))
    written.push(`${name} 512×512 ${bytes}b`)
  }

  for (const size of APPLE_SIZES) {
    const name = `apple-touch-icon-${size}.png`
    const bytes = await write(name, await fullBleed(size, 0.7, INK))
    written.push(`${name} ${size}×${size} ${bytes}b`)
  }

  for (const s of SPLASHES) {
    const name = `splash-${s.file}.png`
    const bytes = await write(name, await splash(s.width * s.dpr, s.height * s.dpr))
    written.push(`${name} ${s.width * s.dpr}×${s.height * s.dpr} ${bytes}b (${s.device})`)
  }

  // The matrix is written to a file rather than only to stdout, because the
  // `<link>` elements have to be kept in step with it and a second copy of this
  // list is exactly the kind of thing that drifts.
  await writeFile(
    path.join(OUT, 'startup-images.json'),
    JSON.stringify(
      SPLASHES.map(({ file, width, height, dpr, device }) => ({
        src: `/icons/splash-${file}.png`,
        width,
        height,
        dpr,
        device,
      })),
      null,
      2,
    ) + '\n',
  )

  const total = written.length
  console.log(`Wrote ${total} files to public/icons:`)
  for (const line of written) console.log('  ' + line)
  console.log(
    `\nStartup image queries are in public/icons/startup-images.json. ` +
      `AppleSplashScreen reads them; regenerate with: npm run icons`,
  )
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
