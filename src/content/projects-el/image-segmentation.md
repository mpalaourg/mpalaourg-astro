---
title: "Τμηματοποίηση Εικόνων"
summary: "Σύγκριση φασματικής ομαδοποίησης και normalized cuts για τμηματοποίηση εικόνων με γράφους."
date: 2019-02-01
featuredImage: "/projects/image-segmentation/featured.png"
tags:
  - multimedia
  - MATLAB
url_code: "https://github.com/mpalaourg/DIP_Image_Segmentation"
url_pdf: ""
url_slides: ""
url_video: ""
weight: 4
---

Αναπαρέστησα την εικόνα ως μη κατευθυντικό γράφο και ομαδοποίησα τα εικονοστοιχεία με βάση ομοιότητες όπως το χρώμα και η ένταση. Το έργο συγκρίνει τρεις προσεγγίσεις:

- **Φασματική ομαδοποίηση:** Χρήση ιδιοδιανυσμάτων της Λαπλασιανής μήτρας του γράφου για ομαδοποίηση σε επιλεγμένο αριθμό συστάδων ([μέθοδος](https://www.kaggle.com/vipulgandhi/spectral-clustering-detailed-explanation#-Algorithm:-)).
- **Normalized cuts:** Διαχωρισμός του γράφου με συνεκτίμηση των συνδέσεων μέσα και ανάμεσα στα τμήματα ([δημοσίευση](https://people.eecs.berkeley.edu/~malik/papers/SM-ncut.pdf#page=4)).
- **Επαναληπτικά normalized cuts:** Διαδοχικός διαχωρισμός τμημάτων με βάση το κριτήριο normalized cut ([δημοσίευση](https://people.eecs.berkeley.edu/~malik/papers/SM-ncut.pdf#page=6)).

Η εικόνα παραπάνω δείχνει πώς διαφέρουν τα τμήματα που προκύπτουν από την ίδια αρχική εικόνα.
