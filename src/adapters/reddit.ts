import axios from "axios";
import type { Adapter, Post, PublishResult } from "../types.js";
import { logger } from "../utils/logger.js";

export class RedditAdapter implements Adapter {
  name = "reddit";
  enabled = true;

  async validate(): Promise<boolean> {
    if (
      !process.env.REDDIT_CLIENT_ID ||
      !process.env.REDDIT_CLIENT_SECRET ||
      !process.env.REDDIT_USERNAME ||
      !process.env.REDDIT_PASSWORD ||
      !process.env.REDDIT_SUBREDDITS
    ) {
      logger.warn("REDDIT credentials or SUBREDDITS missing");
      return false;
    }
    return true;
  }

  async publish(post: Post): Promise<PublishResult> {
    try {
      if (!post.publishedUrl) {
        logger.warn("No publishedUrl available for Reddit posting. Skipping.");
        return {
          platform: this.name,
          success: false,
          error: "No Blogger URL available to share",
        };
      }

      // 1. Get Access Token
      const auth = Buffer.from(
        `${process.env.REDDIT_CLIENT_ID}:${process.env.REDDIT_CLIENT_SECRET}`,
      ).toString("base64");
      const tokenResponse = await axios.post(
        "https://www.reddit.com/api/v1/access_token",
        `grant_type=password&username=${process.env.REDDIT_USERNAME}&password=${process.env.REDDIT_PASSWORD}`,
        {
          headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": `android:com.omnipublisher.app:v1.0 (by /u/${process.env.REDDIT_USERNAME})`,
          },
        },
      );

      const accessToken = tokenResponse.data.access_token;

      // 2. Submit Link to first subreddit (or all if needed)
      const subreddits = process.env.REDDIT_SUBREDDITS?.split(",").map((s) => s.trim());
      if (!subreddits || subreddits.length === 0) {
        logger.warn("No subreddits configured in REDDIT_SUBREDDITS. Skipping Reddit.");
        return {
          platform: this.name,
          success: false,
          error: "Skipping due to missing subreddit configuration.",
        };
      }
      const firstSubreddit = subreddits[0];

      const response = await axios.post(
        "https://oauth.reddit.com/api/submit",
        new URLSearchParams({
          sr: firstSubreddit,
          title: post.title,
          url: post.publishedUrl, // LINK submission
          kind: "link",
        }).toString(),
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": `android:com.omnipublisher.app:v1.0 (by /u/${process.env.REDDIT_USERNAME})`,
          },
        },
      );

      // Extract URL from response
      let postUrl = "";
      if (response.data?.json?.data) {
        postUrl = response.data.json.data.url || "";
      }

      return {
        platform: this.name,
        success: true,
        url: postUrl,
        postId: response.data.json?.data?.id || "",
      };
    } catch (error: any) {
      return {
        platform: this.name,
        success: false,
        error: error.response?.data?.message || error.message,
      };
    }
  }
}
