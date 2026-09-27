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
  /** V4 Section paragraph body (activity_type V4Section → DB section_body). */
  sectionBody?: string;
  /** Draft-only stable identity for V4Section rows (not sent to DB). */
  v4SectionClientId?: string;
};
