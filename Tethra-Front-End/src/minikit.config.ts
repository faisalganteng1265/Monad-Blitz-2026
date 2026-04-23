const ROOT_URL =
  process.env.NEXT_PUBLIC_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000');

/**
 * MiniApp configuration object. Must follow the Farcaster MiniApp specification.
 *
 * @see {@link https://miniapps.farcaster.xyz/docs/guides/publishing}
 */
export const minikitConfig = {
  accountAssociation: {
    "header": "eyJmaWQiOjEzNTYxNTEsInR5cGUiOiJjdXN0b2R5Iiwia2V5IjoiMHgwODAwRDFFNDIzN2MwMEQ5NDJlN0VFRDU1NTlDRTZlYzEwYjZjODhhIn0",
    "payload": "eyJkb21haW4iOiJ0ZXRocmEudHJhZGUifQ",
    "signature": "WesblGHPc7O0Ic0FPOvbU2iYs2vFjwtywWT7tM+avwYVt7Ba7eKM1U9TEMF73lnojcGhr9QP7cWWqsMgRyGaoxs="
  },
  miniapp: {
    version: "1",
    name: "Tethra Trade",
    subtitle: "Think it. Tap it. Trade it",
    description: "One tap. Zero pop-ups. Instant fills.",
    screenshotUrls: [
      `${ROOT_URL}/homepage/TapPosition.png`,
      `${ROOT_URL}/homepage/TapProfit.png`,
      `${ROOT_URL}/homepage/og-banner.png`
    ],
    iconUrl: `${ROOT_URL}/tethra-polos.png`,
    splashImageUrl: `${ROOT_URL}/homepage/og-banner.png`,
    splashBackgroundColor: "#000000",
    homeUrl: ROOT_URL,
    webhookUrl: `${ROOT_URL}/api/webhook`,
    primaryCategory: "finance",
    tags: ["trade", "tap-to-trade", "gasless", "defi"],
    heroImageUrl: `${ROOT_URL}/homepage/og-banner.png`,
    tagline: "Think it. Tap it. Trade it.",
    ogTitle: "Tethra Trade",
    ogDescription: "One tap. Zero pop-ups. Instant fills.",
    ogImageUrl: `${ROOT_URL}/homepage/og-banner.png`,
  },
} as const;