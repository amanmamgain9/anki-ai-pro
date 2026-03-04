import type { MetadataRoute } from "next";

const BASE_URL = "https://aiankipro.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const routes = [
    "/",
    "/about",
    "/blog",
    "/blog/sleep-learning-audio",
    "/pricing",
    "/contact",
    "/terms",
    "/privacy",
    "/refund-policy",
    "/llm.txt",
  ];

  return routes.map((path) => ({
    url: `${BASE_URL}${path}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: path === "/" ? 1 : 0.7,
  }));
}
