export type NotificationType =
  | "like"
  | "follow"
  | "comment"
  | "invite"
  | "saved"
  | "rsvp"
  | "post";
export enum EntityType {
  Post = "post",
  Comment = "comment",
  Hangout = "hangout",
  Experience = "experience",
}

export type EntityTypeString = "post" | "comment" | "hangout" | "experience";

export interface Notification {
  id: string;
  user_id: string;
  actor_id: string | null;
  type: NotificationType;
  entity_type: EntityTypeString;
  entity_id: string;
  additional_data: Record<string, any>;
  is_read: boolean;
  created_at: string;
}

export interface NotificationWithActor extends Notification {
  actor: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  entity?: {
    id: string;
    caption?: string | null;
    type?: string;
    content?: string; // for comments
  };
}

export interface CreateNotificationData {
  user_id: string;
  actor_id: string;
  type: NotificationType;
  entity_type: EntityTypeString;
  entity_id: string;
  additional_data?: Record<string, any>;
}
