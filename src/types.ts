export interface Post {
  title: string;
  slug: string;
  content: string;
  description?: string;
  date?: string;
  tags?: string[];
  coverImage?: string;
  frontmatter: Record<string, any>;
  publishedUrl?: string; // URL from primary publishing platform (Blogger)
  canonicalUrl?: string; // Origin-site URL to attribute SEO credit to (blog-network mode)
  platforms?: string[]; // Adapter names this post routes to; undefined = all enabled
}

export interface PostState {
  url: string;
  postId?: string;
  contentHash?: string;
  lastUpdated?: string;
}

export interface PublishResult {
  platform: string;
  success: boolean;
  url?: string;
  error?: string;
  postId?: string;
}

export interface Adapter {
  name: string;
  enabled: boolean;
  publish(post: Post): Promise<PublishResult>;
  update?(post: Post, postId: string): Promise<PublishResult>;
  validate(): Promise<boolean>;
}

export interface Config {
  dryRun: boolean;
  concurrency: number;
  filter?: string;
}

export interface PostMap {
  [slug: string]: {
    [platform: string]: PostState;
  };
}
