import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'AI API Integrator',
  description: 'Generate production-ready API integrations from documentation',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
