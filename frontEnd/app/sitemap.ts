import { MetadataRoute } from 'next'
 
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://syntaxist.nileshrana.tech'
  
  // Add language-specific routes
  const languages = [
    'python',
    'javascript',
    'cpp',
    'java',
    'go',
    'rust',
    'ruby',
    'php',
    'swift',
    'csharp'
  ]
  
  const languageUrls = languages.map(lang => ({
    url: `${baseUrl}?lang=${lang}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }))
  
  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    ...languageUrls,
  ]
}
