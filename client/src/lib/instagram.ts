/**
 * Instagram's official embed player (https://www.instagram.com/<type>/<shortcode>/embed/).
 * It plays public posts and reels even when the Graph API withholds `media_url`
 * (licensed audio, downloads disabled), because playback happens on Instagram itself.
 */
const PERMALINK_RE = /^https:\/\/(?:www\.)?instagram\.com\/(p|reel|reels|tv)\/([A-Za-z0-9_-]{5,64})\/?(?:[?#].*)?$/;

export function instagramEmbedUrl(permalink: string | null | undefined): string | null {
  if (!permalink) return null;
  const m = PERMALINK_RE.exec(permalink);
  if (!m) return null;
  const type = m[1] === "reels" ? "reel" : m[1];
  return `https://www.instagram.com/${type}/${m[2]}/embed/`;
}
