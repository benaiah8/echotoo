/**
 * Shared external share helpers (copy / native share / Stories tracking).
 * Extracted for Share S2B unified sheet; ShareDrawer may also call these later.
 */

import toast from "react-hot-toast";
import { sharePost } from "../api/services/shares";
import { getPublicShareBaseUrl } from "./publicSiteUrl";
import { postDetailPath } from "../router/Paths";
import { shareUrl } from "./shareUrl";

export function getPublicPostShareUrl(
  postType: "experience" | "hangout",
  postId: string
): string {
  return `${getPublicShareBaseUrl()}${postDetailPath(postType, postId)}`;
}

export async function copyPostShareLink(input: {
  postId: string;
  postType: "experience" | "hangout";
}): Promise<"ok" | "error"> {
  const url = getPublicPostShareUrl(input.postType, input.postId);
  try {
    await navigator.clipboard.writeText(url);
    try {
      await sharePost(input.postId);
    } catch (shareError) {
      console.error("Error tracking share:", shareError);
    }
    toast.success("Link copied to clipboard!");
    return "ok";
  } catch (error) {
    console.error("Error copying link:", error);
    toast.error("Failed to copy link");
    return "error";
  }
}

export async function webSharePostLink(input: {
  postId: string;
  postType: "experience" | "hangout";
}): Promise<"shared" | "clipboard" | "dismissed" | "error"> {
  const url = getPublicPostShareUrl(input.postType, input.postId);
  try {
    const title = `Check out this ${
      input.postType === "hangout" ? "hangout" : "experience"
    }`;
    const outcome = await shareUrl({ title, url });
    if (outcome === "dismissed") return "dismissed";

    try {
      await sharePost(input.postId);
    } catch (shareError) {
      console.error("Error tracking share:", shareError);
    }

    if (outcome === "clipboard") {
      toast.success("Link copied to clipboard!");
      return "clipboard";
    }
    return "shared";
  } catch (error) {
    console.error("Error sharing:", error);
    const copyResult = await copyPostShareLink(input);
    return copyResult === "ok" ? "clipboard" : "error";
  }
}

export async function trackStoryShare(postId: string): Promise<void> {
  const { error } = await sharePost(postId);
  if (error) {
    console.warn("[shareExternalActions] post_shares not recorded:", error);
  }
}
