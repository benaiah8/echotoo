import React, { useState, useEffect } from "react";
import Post from "./Post";
import {
  getCachedAvatar,
  setCachedAvatar,
  preloadAvatar,
} from "../lib/avatarCache";

interface ProgressivePostProps {
  postId: string;
  caption: string | null;
  createdAt: string;
  authorId: string;
  author: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  };
  type: "experience" | "hangout";
  isOwner: boolean;
  onDelete?: () => void;
  status?: "draft" | "published";
  isDraft?: boolean;
  isAnonymous?: boolean;
  anonymousName?: string | null;
  anonymousAvatar?: string | null;
  selectedDates?: any;
}

export default function ProgressivePost(props: ProgressivePostProps) {
  const [showImages, setShowImages] = useState(false);
  const [showAvatar, setShowAvatar] = useState(false);
  const [cachedAvatarUrl, setCachedAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    // Check for cached avatar first
    const cached = getCachedAvatar(props.author.id);
    if (cached) {
      setCachedAvatarUrl(cached);
      setShowAvatar(true);
    } else if (props.author.avatar_url) {
      // Cache the avatar for future use
      setCachedAvatar(props.author.id, props.author.avatar_url);
      preloadAvatar(props.author.avatar_url);
    }

    // Show text immediately
    const textTimer = setTimeout(() => {
      setShowImages(true);
    }, 100);

    // Show avatar after a short delay (if not already cached)
    const avatarTimer = setTimeout(() => {
      setShowAvatar(true);
    }, 200);

    return () => {
      clearTimeout(textTimer);
      clearTimeout(avatarTimer);
    };
  }, [props.author.id, props.author.avatar_url]);

  // Create a modified author object with progressive avatar loading
  const progressiveAuthor = {
    ...props.author,
    avatar_url: showAvatar ? cachedAvatarUrl || props.author.avatar_url : null,
  };

  return (
    <Post
      {...props}
      author={progressiveAuthor}
      // Add any other props for progressive loading
    />
  );
}
