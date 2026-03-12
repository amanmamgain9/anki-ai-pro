import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import { Geist_Mono } from "next/font/google";
import { LocaleProvider } from "@/i18n/client";
import { getServerLocale } from "@/i18n/server";
import AuthSessionProvider from "@/components/AuthSessionProvider";
import ConvexClientProvider from "@/components/ConvexClientProvider";
import {
  SITE_DESCRIPTION,
  SITE_KEYWORDS,
  SITE_LOGO_PATH,
  SITE_NAME,
  SITE_URL,
} from "@/lib/site";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_NAME,
  title: {
    default: SITE_NAME,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: SITE_KEYWORDS,
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180" }],
    shortcut: ["/favicon.ico"],
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: SITE_LOGO_PATH,
        width: 512,
        height: 512,
        alt: `${SITE_NAME} logo`,
      },
    ],
  },
  twitter: {
    card: "summary",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    images: [SITE_LOGO_PATH],
  },
  robots: {
    index: true,
    follow: true,
  },
};

const themeScript = `
(function(){
  try {
    var t = localStorage.getItem("theme");
    if (t === "dark" || (!t && matchMedia("(prefers-color-scheme:dark)").matches)) {
      document.documentElement.classList.add("dark");
    }
  } catch(e) {}
})();
`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getServerLocale();
  return (
    <html lang={locale === "zh" ? "zh-CN" : "en"} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body
        className={`${spaceGrotesk.variable} ${geistMono.variable} antialiased`}
        style={{ fontFamily: "var(--font-space-grotesk), var(--font-sans)" }}
      >
        <LocaleProvider initialLocale={locale}>
          <AuthSessionProvider>
            <ConvexClientProvider>{children}</ConvexClientProvider>
          </AuthSessionProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
