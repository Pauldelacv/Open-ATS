/** Public URL of an organisation asset (logo, cover photo). */
export function mediaUrl(key: string): string {
  return `/media/${key.split("/").map(encodeURIComponent).join("/")}`;
}
