---
title: "JPEG Image Compression"
summary: "Implementation of JPEG standard (ISO/IEC 109181:1994)."
date: 2020-02-01
featuredImage: "/mpalaourg-astro/projects/JPEG/featured.png"
tags:
  - image compression
  - multimedia
  - MATLAB
url_code: "https://github.com/mpalaourg/Multimedia"
url_pdf: "/mpalaourg-astro/el/media/files/jpeg.pdf"
url_slides: ""
url_video: ""
weight: 2
---

This project implements the baseline sequential DCT-based (lossy) JPEG encoder and decoder as described by the ISO-IEC-10918-1-1993 standard. The main steps involved are:

- **Pre-processing**: RGB ↔ YCbCr conversion and subsampling (4:4:4, 4:2:2, 4:2:0)
- **Transformation**: Block [8x8] DCT to convert spatial domain to frequency domain
- **Compression**: Quantization, run-length encoding, and Huffman coding

For a more detailed explanation (in Greek), check the PDF.
