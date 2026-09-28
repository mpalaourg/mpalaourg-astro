// Card previews use smaller assets; detail pages keep the full-size diagrams.
export function cardImage(featuredImage: string): string {
  return featuredImage.replace(/\/featured\.(?:png|webp)$/, "/card.webp");
}
