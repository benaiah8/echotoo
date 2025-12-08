import { supabase } from "../../lib/supabaseClient";

export type InviteStatus = "pending" | "accepted" | "declined" | "expired";

export type Invite = {
  id: string;
  post_id: string;
  inviter_id: string;
  invitee_id: string;
  status: InviteStatus;
  created_at: string;
  updated_at: string;
  expires_at: string;
};

export type InviteWithDetails = Invite & {
  post: {
    id: string;
    caption: string | null;
    type: "experience" | "hangout";
    created_at: string;
  };
  inviter: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  };
  invitee: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  };
};

/**
 * Send invites to multiple users for a post
 */
export async function sendInvites(
  postId: string,
  inviteeIds: string[]
): Promise<{ data: Invite[] | null; error: any; alreadyInvited?: string[] }> {
  try {
    console.log("Sending invites for post:", postId, "to users:", inviteeIds);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    console.log("Current user:", user.id);

    // Check if user owns the post
    const { data: post, error: postError } = await supabase
      .from("posts")
      .select("author_id")
      .eq("id", postId)
      .single();

    if (postError || !post) {
      console.error("Post error:", postError);
      throw new Error("Post not found");
    }

    console.log("Post author:", post.author_id);

    if (post.author_id !== user.id) throw new Error("Not authorized");

    // Check for existing invites to avoid duplicates
    const { data: existingInvites, error: existingError } = await supabase
      .from("invites")
      .select("invitee_id")
      .eq("post_id", postId)
      .in("invitee_id", inviteeIds);

    if (existingError) {
      console.error("Error checking existing invites:", existingError);
      throw new Error("Failed to check existing invites");
    }

    // Filter out users who are already invited
    const alreadyInvitedIds =
      existingInvites?.map((invite) => invite.invitee_id) || [];
    const newInviteeIds = inviteeIds.filter(
      (id) => !alreadyInvitedIds.includes(id)
    );

    console.log("Already invited users:", alreadyInvitedIds);
    console.log("New users to invite:", newInviteeIds);

    // If no new users to invite, return success with empty data
    if (newInviteeIds.length === 0) {
      return {
        data: [],
        error: null,
        alreadyInvited: alreadyInvitedIds,
      };
    }

    // Create invites only for new users
    const invites = newInviteeIds.map((inviteeId) => ({
      post_id: postId,
      inviter_id: user.id,
      invitee_id: inviteeId,
    }));

    console.log("Inserting new invites:", invites);

    const { data, error } = await supabase
      .from("invites")
      .insert(invites)
      .select("*");

    if (error) {
      console.error("Insert error:", error);
    } else {
      console.log("Successfully inserted invites:", data);
    }

    return {
      data,
      error,
      alreadyInvited: alreadyInvitedIds,
    };
  } catch (error) {
    console.error("Send invites error:", error);
    return { data: null, error };
  }
}

/**
 * Get invites sent by the current user
 */
export async function getSentInvites(): Promise<{
  data: InviteWithDetails[] | null;
  error: any;
}> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: new Error("Not authenticated") };

    const { data, error } = await supabase
      .from("invites")
      .select(
        `
        *,
        post:posts(id, caption, type, created_at)
      `
      )
      .eq("inviter_id", user.id)
      .order("created_at", { ascending: false });

    return { data, error };
  } catch (error) {
    return { data: null, error };
  }
}

/**
 * Get invites received by the current user
 */
export async function getReceivedInvites(): Promise<{
  data: InviteWithDetails[] | null;
  error: any;
}> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: new Error("Not authenticated") };

    const { data, error } = await supabase
      .from("invites")
      .select(
        `
        *,
        post:posts(id, caption, type, created_at)
      `
      )
      .eq("invitee_id", user.id)
      .order("created_at", { ascending: false });

    return { data, error };
  } catch (error) {
    return { data: null, error };
  }
}

/**
 * Update invite status (accept/decline)
 */
export async function updateInviteStatus(
  inviteId: string,
  status: "accepted" | "declined"
): Promise<{ data: Invite | null; error: any }> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { data, error } = await supabase
      .from("invites")
      .update({ status })
      .eq("id", inviteId)
      .eq("invitee_id", user.id) // Security: only invitee can update
      .select("*")
      .single();

    return { data, error };
  } catch (error) {
    return { data: null, error };
  }
}

/**
 * Delete an invite (only inviter can delete)
 */
export async function deleteInvite(
  inviteId: string
): Promise<{ data: any; error: any }> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { data, error } = await supabase
      .from("invites")
      .delete()
      .eq("id", inviteId)
      .eq("inviter_id", user.id); // Security: only inviter can delete

    return { data, error };
  } catch (error) {
    return { data: null, error };
  }
}

/**
 * Get invites for a specific post
 */
export async function getPostInvites(
  postId: string
): Promise<{ data: InviteWithDetails[] | null; error: any }> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: new Error("Not authenticated") };

    // Check if user owns the post
    const { data: post, error: postError } = await supabase
      .from("posts")
      .select("author_id")
      .eq("id", postId)
      .single();

    if (postError || !post) throw new Error("Post not found");
    if (post.author_id !== user.id) throw new Error("Not authorized");

    const { data, error } = await supabase
      .from("invites")
      .select("*")
      .eq("post_id", postId)
      .order("created_at", { ascending: false });

    return { data, error };
  } catch (error) {
    return { data: null, error };
  }
}

/**
 * Get pending invites for the current user
 */
export async function getPendingInvites(): Promise<{
  data: InviteWithDetails[] | null;
  error: any;
}> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: new Error("Not authenticated") };

    const { data, error } = await supabase
      .from("invites")
      .select(
        `
        *,
        post:posts(id, caption, type, created_at),
        inviter:profiles!inviter_id(id, username, display_name, avatar_url)
      `
      )
      .eq("invitee_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    return { data, error };
  } catch (error) {
    return { data: null, error };
  }
}

/**
 * Accept an invite
 */
export async function acceptInvite(
  inviteId: string
): Promise<{ data: Invite | null; error: any }> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { data, error } = await supabase
      .from("invites")
      .update({ status: "accepted" })
      .eq("id", inviteId)
      .eq("invitee_id", user.id) // Security: only invitee can accept
      .select("*")
      .single();

    return { data, error };
  } catch (error) {
    return { data: null, error };
  }
}

/**
 * Decline an invite
 */
export async function declineInvite(
  inviteId: string
): Promise<{ data: Invite | null; error: any }> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { data, error } = await supabase
      .from("invites")
      .update({ status: "declined" })
      .eq("id", inviteId)
      .eq("invitee_id", user.id) // Security: only invitee can decline
      .select("*")
      .single();

    return { data, error };
  } catch (error) {
    return { data: null, error };
  }
}
