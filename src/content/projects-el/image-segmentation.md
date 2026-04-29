---
title: "Τμηματοποίηση Εικόνων"
summary: "Τμηματοποίηση εικόνων με χρήση αλγορίθμων βασισμένων σε γράφους."
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

Αναπαράσταση εικόνας ως πλήρως συνδεδεμένο, μη κατευθυντικό γράφο και διαχωρισμός σε τμήματα βάσει κοινών χαρακτηριστικών (χρώμα, ένταση).

Υλοποιημένες τεχνικές:

- **Spectral Clustering**: Διαίρεση σε k συστάδες χρησιμοποιώντας ιδιοτιμές του γραφο-Λαπλασιάν ([Αλγόριθμος](https://www.kaggle.com/vipulgandhi/spectral-clustering-detailed-explanation#-Algorithm:-))
- **Normalized Cuts**: Τμηματοποίηση με τις k μικρότερες ιδιοτιμές για διαχωρισμό γράφου ([Αλγόριθμος](https://people.eecs.berkeley.edu/~malik/papers/SM-ncut.pdf#page=4))
- **Recursive Normalized Cuts**: Αυτόματος προσδιορισμός αριθμού συστάδων με χρήση της μετρικής Ncut(A, B) ([Αλγόριθμος](https://people.eecs.berkeley.edu/~malik/papers/SM-ncut.pdf#page=6))
