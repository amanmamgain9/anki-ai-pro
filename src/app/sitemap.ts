import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

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
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: path === "/" ? 1 : 0.7,
  }));
}
