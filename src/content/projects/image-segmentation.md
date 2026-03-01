---
title: "Image Segmentation"
summary: "Image segmentation using graph-based clustering algorithms."
date: 2019-02-01
featuredImage: "/mpalaourg-astro/projects/image-segmentation/featured.png"
tags:
  - multimedia
  - MATLAB
url_code: "https://github.com/mpalaourg/DIP_Image_Segmentation"
url_pdf: ""
url_slides: ""
url_video: ""
weight: 4
---

This project represents an image as a fully connected, non-directional graph and partitions it into segments based on common characteristics like color or intensity.

Implemented techniques:

- **Spectral Clustering**: Partitions into k clusters using graph Laplacian eigenvalues ([Algorithm](https://www.kaggle.com/vipulgandhi/spectral-clustering-detailed-explanation#-Algorithm:-))
- **Normalized Cuts**: Segments using the k smallest eigenvalues for graph partitioning ([Algorithm](https://people.eecs.berkeley.edu/~malik/papers/SM-ncut.pdf#page=4))
- **Recursive Normalized Cuts**: Automatically determines the number of clusters using the Ncut(A, B) metric ([Algorithm](https://people.eecs.berkeley.edu/~malik/papers/SM-ncut.pdf#page=6))
