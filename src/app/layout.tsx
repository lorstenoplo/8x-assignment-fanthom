import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import "@fontsource-variable/plus-jakarta-sans";
import { Toaster } from "sonner";
import "./globals.css";

// Plus Jakarta Sans, self-hosted via @fontsource (real static font files; a
// live fetch to Google's font service is unavailable in this environment).
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Aura",
  description: "AI meeting notetaker — real capture, real transcripts, real recall.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {/* One app-wide wash, not a per-page hero decoration — it needs to
            show through the translucent sidebar/header everywhere, not just
            patch the content area of one route. */}
        {/* Two large blurred blobs rather than a linear gradient in a
            fixed-height box — a box has a hard bottom/side edge that a
            linear fade doesn't fully hide, which is what kept reading as a
            "patch". Blurred circles fade to nothing well inside the
            viewport-covering container, so there's no edge to see. */}
        <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          <div className="animate-aurora absolute -left-32 -top-32 h-[42rem] w-[42rem] rounded-full bg-primary-fixed/55 blur-[130px]" />
          <div
            className="animate-aurora absolute -top-16 right-[-10rem] h-[36rem] w-[36rem] rounded-full bg-secondary-fixed/45 blur-[130px]"
            style={{ animationDelay: "-8s" }}
          />
        </div>
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
