export const personId = 'https://mpalaourg.dev/#person';
export const scholarProfileUrl = 'https://scholar.google.com/citations?user=63n7Lc8AAAAJ&hl=en';

export const personStructuredData = {
  '@type': 'Person',
  '@id': personId,
  name: 'Georgios Balaouras',
  givenName: 'Georgios',
  familyName: 'Balaouras',
  alternateName: ['Γιώργος Μπαλαούρας', 'Γεώργιος Μπαλαούρας', 'George Balaouras'],
  url: 'https://mpalaourg.dev/about/',
  image: 'https://mpalaourg.dev/media/avatar.jpg',
  description: 'Senior Machine Learning Engineer building production ML, LLM, and agentic AI systems.',
  jobTitle: 'Senior Machine Learning Engineer',
  worksFor: {
    '@type': 'Organization',
    name: 'Kaizen Gaming',
    url: 'https://www.kaizengaming.com/',
  },
  alumniOf: {
    '@type': 'CollegeOrUniversity',
    name: 'Aristotle University of Thessaloniki',
    url: 'https://www.auth.gr/',
  },
  knowsAbout: [
    'Machine learning engineering',
    'Production machine learning systems',
    'Large language model applications',
    'Agentic AI systems',
    'Video summarization',
  ],
  sameAs: [
    'https://github.com/mpalaourg',
    'https://www.linkedin.com/in/georgebalaouras/',
    scholarProfileUrl,
  ],
} as const;

export const jsonLd = (data: unknown) => JSON.stringify(data).replace(/</g, '\\u003c');
