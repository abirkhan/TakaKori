import startupImages from '../../public/icons/startup-images.json'

/**
 * iOS launch images.
 *
 * Without these, an installed TakaKori opens to a white screen on first launch:
 * iOS falls back to a screenshot of the app's last state, and on a first launch
 * there is no last state. It is the one part of "feels like an installed app"
 * that is purely additive on iOS — everything else about standalone mode is
 * already correct.
 *
 * **These cannot come from the Metadata API.** `appleWebApp` covers the capable
 * flag, the title and the status bar style, but there is no field for startup
 * images, so they are raw `<link>` elements. React 19 hoists `<link>` into
 * `<head>` wherever it is rendered, which is why this is a component in the
 * layout rather than a `next/head` entry.
 *
 * **The matrix is imported, not restated.** iOS matches a startup image by an
 * exact media query and silently ignores one that does not match, so a file
 * generated without a link, or a link without a file, both fail with no error at
 * all. `npm run icons` writes `startup-images.json` from the same list it
 * renders, so the two cannot drift and a missing file is a build error rather
 * than a blank screen on someone's phone.
 *
 * Portrait only. The app declares `orientation: 'portrait'`, so a landscape
 * device is rotated rather than given a differently-shaped image.
 */
export function AppleStartupImages() {
  return (
    <>
      {startupImages.map((image) => (
        <link
          key={image.src}
          rel="apple-touch-startup-image"
          href={image.src}
          media={`(device-width: ${image.width}px) and (device-height: ${image.height}px) and (-webkit-device-pixel-ratio: ${image.dpr}) and (orientation: portrait)`}
        />
      ))}
    </>
  )
}
