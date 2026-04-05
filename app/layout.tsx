import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Skill Manager",
  description: "Browse and discover your Claude Code skills and plugins",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
