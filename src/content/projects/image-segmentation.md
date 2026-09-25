---
title: "Image Segmentation"
summary: "A comparison of spectral clustering and normalized cuts for graph-based image segmentation."
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

I represented an image as an undirected graph and grouped pixels into segments using similarities such as color and intensity. The project compares three approaches:

- **Spectral clustering:** Use graph Laplacian eigenvectors to group pixels into a chosen number of clusters ([method](https://www.kaggle.com/vipulgandhi/spectral-clustering-detailed-explanation#-Algorithm:-)).
- **Normalized cuts:** Partition the graph while accounting for the strength of connections within and between segments ([paper](https://people.eecs.berkeley.edu/~malik/papers/SM-ncut.pdf#page=4)).
- **Recursive normalized cuts:** Repeatedly split segments using the normalized-cut criterion ([paper](https://people.eecs.berkeley.edu/~malik/papers/SM-ncut.pdf#page=6)).

The figure above shows how the resulting segments differ for the same source image.
