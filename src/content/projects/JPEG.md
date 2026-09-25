---
title: "JPEG Image Compression"
summary: "A baseline JPEG encoder and decoder built around DCT, quantization, and entropy coding."
date: 2020-02-01
featuredImage: "/projects/JPEG/featured.png"
tags:
  - image compression
  - multimedia
  - MATLAB
url_code: "https://github.com/mpalaourg/Multimedia"
url_pdf: "/el/media/files/jpeg.pdf"
url_slides: ""
url_video: ""
weight: 2
---

I implemented the baseline sequential JPEG encoding and decoding pipeline described in [ISO/IEC 10918-1:1994](https://www.iso.org/standard/18902.html). The project follows an image through three main stages:

- **Color preparation:** Convert RGB to YCbCr and apply 4:4:4, 4:2:2, or 4:2:0 chroma sampling.
- **Transform and quantization:** Apply an 8 × 8 discrete cosine transform (DCT) and quantize the coefficients.
- **Entropy coding:** Encode the resulting coefficients with run-length and Huffman coding, then reverse the steps to reconstruct the image.

The linked PDF explains the implementation in Greek.
