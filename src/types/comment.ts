// Comment types for the comments system
export interface Comment {
  id: string;
  post_id: string;
  author_id: string;
  parent_id?: string | null;
  content: string;
  images?: string[]; // Array of image URLs
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}

export interface CommentWithAuthor extends Comment {
  author: {
    id: string;
    username: string;
    display_name: string;
    avatar_url?: string;
  };
}

export interface CommentWithDetails extends CommentWithAuthor {
  like_count: number;
  is_liked: boolean;
  replies?: CommentWithDetails[];
}

export interface CommentLike {
  id: string;
  comment_id: string;
  user_id: string;
  created_at: string;
}

export interface CreateCommentData {
  post_id: string;
  parent_id?: string | null;
  content: string;
  images?: string[]; // Array of image URLs
}

export interface UpdateCommentData {
  content: string;
}

export interface CommentCount {
  post_id: string;
  count: number;
}
