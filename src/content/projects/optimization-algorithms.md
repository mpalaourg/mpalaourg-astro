---
title: "Optimization Algorithms"
summary: "MATLAB implementations of local, constrained, and global optimization methods."
date: 2018-02-01
featuredImage: "/projects/optimization-algorithms/featured.webp"
tags:
  - function minimum
  - function estimation
  - machine learning
  - MATLAB
url_code: "https://github.com/mpalaourg/Optimization_Techniques"
url_pdf: ""
url_slides: ""
url_video: ""
weight: 5
---

I implemented optimization methods in MATLAB, from one-dimensional searches to methods for multivariable and constrained problems. The repository groups them by the type of objective:

**1-D Convex Functions:**
- Bisection Method ([Algorithm](https://mathworld.wolfram.com/Bisection.html))
- Golden Section Method ([Algorithm](http://web.tecnico.ulisboa.pt/mcasquilho/compute/com/,Fibonacci/pdfHXu_ch1.pdf#page=8))
- Fibonacci Method ([Algorithm](http://web.tecnico.ulisboa.pt/mcasquilho/compute/com/,Fibonacci/pdfHXu_ch1.pdf#page=13))
- Bisection with Derivatives ([Algorithm](http://www.princeton.edu/~aaa/Public/Teaching/ORF363_COS323/F16/ORF363_COS323_F16_Lec7.pdf#page=2))

**2-D Functions (no analytical form):**
- Steepest Descent ([Algorithm](http://www.cs.cmu.edu/~pradeepr/convexopt/Lecture_Slides/Gradient-Descent.pdf))
- Newton Method ([Algorithm](http://www.cs.cmu.edu/~pradeepr/convexopt/Lecture_Slides/Newton_methods.pdf#page=11))
- Levenberg-Marquardt ([Algorithm](http://ananth.in/docs/lmtut.pdf))
- Conjugate Gradient (Polak-Ribière) ([Algorithm](http://www.cs.cmu.edu/~pradeepr/convexopt/Lecture_Slides/conjugate_direction_methods.pdf#page=38))
- Quasi-Newton (Davidon-Fletcher-Powell) ([Algorithm](https://www.stat.cmu.edu/~ryantibs/convexopt-F13/lectures/11-QuasiNewton-AnnotatedOnClass.pdf#page=21))

**2-D with Constraints:**
- Steepest Descent with/without constraints ([Algorithm](https://www.cs.ccu.edu.tw/~wtchu/courses/2015s_OPT/Lectures/Chapter%2023%20Algorithms%20for%20Constrained%20Optimization.pdf#page=2))

**Global Optimization:**
- Genetic Algorithm for unknown continuous functions

The surface shown above illustrates how an optimization path moves across an objective function toward a minimum.
