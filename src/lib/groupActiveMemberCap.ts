/**
 * Shared authoritative Group conversation active-member capacity.
 * Host/admin counts toward this total. Pending requests / left members do not.
 */
export const GROUP_ACTIVE_MEMBER_CAP = 200;

/** Max selectable non-creator members when creating a group (creator is 1 seat). */
export const GROUP_MAX_OTHER_MEMBERS = GROUP_ACTIVE_MEMBER_CAP - 1;
