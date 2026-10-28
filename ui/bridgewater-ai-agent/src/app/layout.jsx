import './globals.css';

export const metadata = {
  title: 'Bridgewater-Style AI Agent - AI-Powered Investment Research',
  description: 'Institutional-grade AI research workspace for modern investment professionals',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
