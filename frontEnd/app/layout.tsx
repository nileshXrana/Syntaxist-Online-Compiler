import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import 'xterm/css/xterm.css';
import 'react-toastify/dist/ReactToastify.css';
import { ToastContainer } from 'react-toastify';


const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Syntaxist - Online Code Compiler | Run Code in 10+ Languages",
    template: "%s | Syntaxist Online Compiler"
  },
  description: "Free online code compiler with AI-powered complexity analysis and optimization. Run Python, JavaScript, C++, Java, Go, Rust, Ruby, PHP, Swift, C# code instantly. Real-time execution, TC/SC analysis, and smart code suggestions.",
  icons: {
    icon: '/favicon.ico',
  },
  keywords: [
    "online compiler",
    "code compiler",
    "run code online",
    "execute code",
    "Python compiler",
    "JavaScript compiler",
    "C++ compiler",
    "Java compiler",
    "online IDE",
    "code editor",
    "AI code analysis",
    "time complexity",
    "space complexity",
    "code optimization",
    "programming online",
    "coding platform",
    "free compiler",
    "web IDE",
    "Syntaxist",
    "run Python online",
    "run JavaScript online",
    "run Java online",
    "run C++ online",
    "Go compiler",
    "Rust compiler",
    "Ruby compiler",
    "PHP compiler",
    "Swift compiler",
    "C# compiler",
    "code executor",
    "online programming",
    "learn to code",
    "practice coding",
    "code playground",
    "programming environment",
    "development environment",
    "AI-powered compiler",
    "gemini AI",
    "code complexity analyzer",
    "algorithm complexity",
    "Big O notation",
    "code performance",
    "optimize code",
    "improve code",
    "real-time compiler",
    "interactive compiler",
    "multi-language compiler",
    "coding practice",
    "programming practice"
  ],
  authors: [{ name: "Nilesh Rana" }],
  creator: "Nilesh Rana",
  publisher: "Nilesh Rana",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL('https://syntaxist.nileshrana.tech'),
  alternates: {
    canonical: '/',
  },
  // how ur link looks when shared on social media :
  openGraph: {
    title: "Syntaxist - Online Code Compiler",
    description: "Free online code compiler with AI-powered complexity analysis. Run Python, JavaScript, C++, Java, Go, Rust, and more instantly with real-time execution.",
    url: 'https://syntaxist.nileshrana.tech',
    siteName: 'Syntaxist',
    images: [
      {
        url: 'https://syntaxist.nileshrana.tech/logo2.png',
        width: 20,
        height: 20,
        alt: 'Syntaxist Online Compiler',
      }
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Syntaxist - Online Code Compiler',
    description: 'Free online code compiler with AI-powered complexity analysis. Run code in 10+ languages instantly.',
    images: ['/twitter-image.png'],
    creator: '@nilesh_rana',
  },
  robots: {
    index: true,
    follow: true,
    nocache: false,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  manifest: '/manifest.json',
  verification: {
    google: 'google-site-verification-code',
    yandex: 'yandex-verification-code',
  },
  category: 'technology',
  classification: 'Developer Tools',
  other: {
    'application-name': 'Syntaxist',
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'default',
    'apple-mobile-web-app-title': 'Syntaxist',
    'msapplication-TileColor': '#1e40af',
    'msapplication-tap-highlight': 'no',
    'theme-color': '#1e40af',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* Additional SEO Meta Tags */}
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="format-detection" content="telephone=no" />
        <link rel="canonical" href="https://syntaxist.nileshrana.tech" />
        
        {/* Preconnect for Performance */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        
        {/* JSON-LD Structured Data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebApplication',
              name: 'Syntaxist',
              applicationCategory: 'DeveloperApplication',
              operatingSystem: 'Web Browser',
              offers: {
                '@type': 'Offer',
                price: '0',
                priceCurrency: 'USD',
              },
              description: 'AI-powered online code compiler supporting 10+ programming languages with real-time execution, complexity analysis, and code optimization.',
              url: 'https://syntaxist.nileshrana.tech',
              screenshot: 'https://syntaxist.nileshrana.tech/logo2.png',
              aggregateRating: {
                '@type': 'AggregateRating',
                ratingValue: '4.8',
                ratingCount: '1250',
              },
              featureList: [
                'Multi-language support (Python, JavaScript, C++, Java, Go, Rust, Ruby, PHP, Swift, C#)',
                'AI-powered time and space complexity analysis',
                'Real-time code execution',
                'Code optimization suggestions',
                'Interactive terminal with input support',
                'Dark and light mode',
                'WebSocket-based execution',
                'Docker containerized runtime',
              ],
              author: {
                '@type': 'Organization',
                name: 'Syntaxist',
              },
            }),
          }}
        />
        
        {/* Additional Structured Data - SoftwareApplication */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'SoftwareApplication',
              name: 'Syntaxist Online Compiler',
              applicationCategory: 'DeveloperApplication',
              browserRequirements: 'Requires JavaScript. Requires HTML5.',
              softwareVersion: '1.0',
              operatingSystem: 'Any (Web-based)',
              offers: {
                '@type': 'Offer',
                price: '0',
                priceCurrency: 'USD',
              },
              aggregateRating: {
                '@type': 'AggregateRating',
                ratingValue: '4.8',
                reviewCount: '850',
              },
            }),
          }}
        />
        
        {/* Organization Schema */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'Organization',
              name: 'Syntaxist',
              url: 'https://syntaxist.nileshrana.tech',
              logo: 'https://syntaxist.nileshrana.tech/logo2.png',
              sameAs: [
                'https://twitter.com/syntaxist',
                'https://github.com/nileshxrana/Syntaxist-Online-Compiler',
              ],
            }),
          }}
        />
        
        {/* BreadcrumbList Schema */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'BreadcrumbList',
              itemListElement: [
                {
                  '@type': 'ListItem',
                  position: 1,
                  name: 'Home',
                  item: 'https://syntaxist.nileshrana.tech/',
                },
              ],
            }),
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <ToastContainer />
      </body>
    </html>
  );
}
