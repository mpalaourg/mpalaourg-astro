import type { CollectionEntry } from 'astro:content';

export type ProjectEntry = CollectionEntry<'projects'> | CollectionEntry<'projects-el'>;
export type ProjectLanguage = 'en' | 'el';

type ProjectVisual = {
  width: number;
  height: number;
  alt: Record<ProjectLanguage, string>;
  caption: Record<ProjectLanguage, string>;
};

export const projectVisuals: Record<string, ProjectVisual> = {
  'from-workflows-to-agents': {
    width: 1200,
    height: 675,
    alt: {
      en: 'Workshop diagram comparing fixed LLM workflows, agent tools, and an evaluation stack.',
      el: 'Διάγραμμα workshop που συγκρίνει σταθερές ροές εργασίας LLM, εργαλεία agents και στάδια αξιολόγησης.',
    },
    caption: {
      en: 'Workshop overview: workflows, agents, and evaluation.',
      el: 'Επισκόπηση workshop: ροές εργασίας, agents και αξιολόγηση.',
    },
  },
  thesis: {
    width: 740,
    height: 580,
    alt: {
      en: 'Thesis data pipeline from BatteryApp collection through preprocessing, usage clustering, and energy-drain prediction.',
      el: 'Ροή δεδομένων της διπλωματικής από το BatteryApp έως την προεπεξεργασία, την ομαδοποίηση χρήσης και την πρόβλεψη κατανάλωσης ενέργειας.',
    },
    caption: {
      en: 'Battery usage collection and analysis pipeline.',
      el: 'Ροή συλλογής και ανάλυσης δεδομένων κατανάλωσης μπαταρίας.',
    },
  },
  jpeg: {
    width: 750,
    height: 400,
    alt: {
      en: 'Flowchart of JPEG compression and decompression stages, from color conversion to entropy coding and back.',
      el: 'Διάγραμμα των σταδίων συμπίεσης και αποσυμπίεσης JPEG, από τη μετατροπή χρώματος έως την κωδικοποίηση και την αντίστροφη πορεία.',
    },
    caption: {
      en: 'JPEG encoder and decoder pipeline.',
      el: 'Ροή κωδικοποιητή και αποκωδικοποιητή JPEG.',
    },
  },
  'bashic-shell': {
    width: 255,
    height: 194,
    alt: {
      en: 'Terminal icon representing the custom Unix shell project.',
      el: 'Εικονίδιο τερματικού για το έργο υλοποίησης Unix shell.',
    },
    caption: {
      en: 'Custom Unix shell implementation.',
      el: 'Υλοποίηση Unix shell.',
    },
  },
  'image-segmentation': {
    width: 570,
    height: 391,
    alt: {
      en: 'Comparison of a source image with spectral clustering and normalized-cut segmentation results.',
      el: 'Σύγκριση αρχικής εικόνας με αποτελέσματα τμηματοποίησης μέσω φασματικής ομαδοποίησης και normalized cuts.',
    },
    caption: {
      en: 'Comparison of graph-based image segmentation methods.',
      el: 'Σύγκριση μεθόδων τμηματοποίησης εικόνας που βασίζονται σε γράφους.',
    },
  },
  'optimization-algorithms': {
    width: 555,
    height: 450,
    alt: {
      en: 'Three-dimensional optimization surface with a path descending toward a minimum.',
      el: 'Τρισδιάστατη επιφάνεια βελτιστοποίησης με διαδρομή προς ένα ελάχιστο.',
    },
    caption: {
      en: 'Optimization path over an objective function.',
      el: 'Διαδρομή βελτιστοποίησης πάνω σε μια αντικειμενική συνάρτηση.',
    },
  },
  'pi-messenger': {
    width: 259,
    height: 194,
    alt: {
      en: 'Raspberry Pi Zero board used for the distributed messenger project.',
      el: 'Πλακέτα Raspberry Pi Zero για το έργο κατανεμημένης ανταλλαγής μηνυμάτων.',
    },
    caption: {
      en: 'Raspberry Pi Zero messaging hardware.',
      el: 'Raspberry Pi Zero για την ανταλλαγή μηνυμάτων.',
    },
  },
};
