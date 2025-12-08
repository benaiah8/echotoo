// src/types/post.ts
export type ActivityType = {
  title: string;
  activityType?: string;
  customActivity?: string;
  locationDesc?: string;
  tags: string[];
  location?: string;
  locationNotes?: string;
  locationUrl?: string;
  images: string[]; // Cloudinary secure_url strings
  additionalInfo?: { title: string; value: string }[];
};
