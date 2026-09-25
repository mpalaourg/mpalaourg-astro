import type { CollectionEntry } from 'astro:content';

export type PublicationEntry = CollectionEntry<'publications'> | CollectionEntry<'publications-el'>;
export type PublicationLanguage = 'en' | 'el';

type PublicationVisual = {
  width: number;
  height: number;
  alt: Record<PublicationLanguage, string>;
  caption: Record<PublicationLanguage, string>;
};

export const publicationVisuals: Record<string, PublicationVisual> = {
  ism2022: {
    width: 1200,
    height: 440,
    alt: {
      en: 'Diagram showing how video frames pass through an attention network to produce a summary and an explanation mask.',
      el: 'Διάγραμμα που δείχνει πώς τα καρέ βίντεο περνούν από δίκτυο προσοχής για την παραγωγή περίληψης και μάσκας επεξήγησης.',
    },
    caption: {
      en: 'Overview of the attention-based explanation method.',
      el: 'Επισκόπηση της μεθόδου επεξήγησης με βάση την προσοχή.',
    },
  },
  icmr2022: {
    width: 2033,
    height: 1393,
    alt: {
      en: 'CA-SUM architecture: a CNN and concentrated attention estimate the importance of video frames.',
      el: 'Αρχιτεκτονική CA-SUM: ένα CNN και μηχανισμός συγκεντρωμένης προσοχής εκτιμούν τη σημασία των καρέ.',
    },
    caption: {
      en: 'Architecture of the concentrated-attention summarization model.',
      el: 'Αρχιτεκτονική του μοντέλου περίληψης με συγκεντρωμένη προσοχή.',
    },
  },
  ism2021: {
    width: 2033,
    height: 1393,
    alt: {
      en: 'PGL-SUM architecture combining global and local multi-head attention to score video frames.',
      el: 'Αρχιτεκτονική PGL-SUM που συνδυάζει καθολική και τοπική πολυκέφαλη προσοχή για την αξιολόγηση καρέ.',
    },
    caption: {
      en: 'Architecture combining global and local attention.',
      el: 'Αρχιτεκτονική που συνδυάζει καθολική και τοπική προσοχή.',
    },
  },
};

export function formatPublicationAuthors(post: PublicationEntry): string {
  return post.data.authors.map((author, index) =>
    isEqualContributionNote(post.data.author_notes?.[index]) ? `${author}*` : author
  ).join(', ');
}

export function hasEqualContribution(post: PublicationEntry): boolean {
  return post.data.author_notes?.some(isEqualContributionNote) ?? false;
}

function isEqualContributionNote(note?: string): boolean {
  const value = note?.toLowerCase() ?? '';
  return value.includes('equal') || value.includes('ίση');
}
