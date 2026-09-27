/** Company/admin in-app announcements — not invite thread_kind "announcement". */

export type CompanyAnnouncementRuntimeItem = {
  id: string;
  title: string;
  message: string;
  starts_at: string | null;
  expires_at: string | null;
  created_at: string;
  is_seen: boolean;
};

export type CompanyAnnouncementAdminRow = {
  id: string;
  title: string;
  message: string;
  is_active: boolean;
  starts_at: string | null;
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CompanyAnnouncementAdminSaveInput = {
  title: string;
  message: string;
  is_active: boolean;
  starts_at: string | null;
  expires_at: string | null;
};
