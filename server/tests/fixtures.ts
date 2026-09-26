/** Sample Instagram Graph API Business Discovery response used by tests. */
const cfgId = "17841400000000001";
export const GRAPH_OK = {
  id: cfgId,
  business_discovery: {
    id: "17841400000000099",
    username: "brandaccount",
    name: "Brand Account",
    biography: "Official brand",
    website: "https://brand.example",
    profile_picture_url: "https://scontent.cdninstagram.com/pic.jpg",
    followers_count: 12345,
    follows_count: 67,
    media_count: 890,
    media: {
      data: [
        { id: "m1", media_type: "VIDEO", media_product_type: "REELS", media_url: "https://cdn/v.mp4", thumbnail_url: "https://cdn/t.jpg", permalink: "https://www.instagram.com/reel/abc/", timestamp: "2026-09-20T10:00:00+0000", like_count: 10, comments_count: 2, caption: "hi" },
        { id: "m2", media_type: "VIDEO", media_product_type: "REELS", thumbnail_url: "https://cdn/t2.jpg", permalink: "https://www.instagram.com/reel/def/", timestamp: "2026-09-19T10:00:00+0000" },
        { id: "m3", media_type: "IMAGE", media_product_type: "FEED", media_url: "https://cdn/i.jpg", permalink: "https://www.instagram.com/p/ghi/", timestamp: "2026-09-18T10:00:00+0000", like_count: 5 },
      ],
    },
  },
};

