export interface ActivityType {
  title: string; // pill label (“Activity 1”, etc)
  activityType: string; // your dropdown value
  customActivity: string; // free‐form text
  locationDesc: string; // location description
  tags: string[]; // tag list
  location: string; // location name (optional)
}
