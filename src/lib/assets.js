// The application's own images, served from this repository.
//
// These used to be absolute URLs into media.base44.com — the platform's asset
// CDN. That made the look of the app depend on a service we do not control and
// cannot redeploy: the images are not in any build, so nothing here would fail
// if one disappeared. One already had. The hero behind the sign-in screen
// pointed at an object the CDN answered with "storage: object doesn't exist",
// and it had been an invisible broken image for as long as anyone had looked.
//
// The files now live in public/assets and ship with the bundle. Same-origin
// also means the report pages can rasterise the icon without tainting a canvas,
// which is what html2canvas needs to put it in a PDF.
//
// Paths, not imports: index.html and public/manifest.json name the same files
// and neither goes through the bundler, so a hashed asset URL could not be
// shared with them. Anything under public/ is copied verbatim and served at the
// path below, which all three can write.

// 192px. Every on-screen use draws it small — h-10 in the reports and headers —
// and this is still large enough to stay sharp in a printed report.
export const QUARTZ_ICON = "/assets/quartz-icon-192.png";

// 1024x683 photograph, behind the landing, sign-in and assessment screens.
export const HERO_IMAGE = "/assets/hero.jpg";
