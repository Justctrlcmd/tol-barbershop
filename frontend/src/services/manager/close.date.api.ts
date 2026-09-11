import { authFetch } from "@/lib/api";

export interface ClosedDate {
  id: number;
  date_closed: string;
  closure_scope: "shop" | "barber";
  barber_user_id: number | null;
  barber_name: string | null;
  reason: string;
  is_removed: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateClosedDateData {
  date_closed: string;
  closure_scope: "shop" | "barber";
  barber_user_id?: number;
  reason: string;
}

export interface UpdateClosedDateData {
  is_removed: true;
}

export interface PaginatedClosedDates {
  data: ClosedDate[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
}

export type ClosedDateActivity = {
  id: number;
  activity_type: "closed_date" | "open_slot";
  closed_date_id: number | null;
  schedule_open_slot_id: number | null;
  action: "closed" | "reopened" | "added" | "removed";
  closure_scope: "shop" | "barber";
  date_closed: string | null;
  slot_date: string | null;
  slot_time: string | null;
  barber_user_id: number | null;
  barber_name: string | null;
  reason: string | null;
  actor_name: string | null;
  created_at: string;
};

export type PaginatedClosedDateActivities = {
  data: ClosedDateActivity[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
};

export const getClosedDates = async (
  page: number = 1,
  perPage: number = 5,
  scope: "shop" | "all" | "availability" = "shop",
  barberId?: number,
): Promise<PaginatedClosedDates> => {
  const params = new URLSearchParams({
    page: String(page),
    per_page: String(perPage),
    scope,
  });
  if (barberId) params.set("barber_id", String(barberId));

  const response = await authFetch(
    `${process.env.NEXT_PUBLIC_API_URL}/closed-dates?${params.toString()}`,
  );

  const paginatedData = response.data;

  return {
    data: paginatedData?.data || [],
    current_page: paginatedData?.current_page || 1,
    last_page: paginatedData?.last_page || 1,
    per_page: paginatedData?.per_page || perPage,
    total: paginatedData?.total || 0,
  };
};

export const createClosedDate = async (
  data: CreateClosedDateData,
): Promise<void> => {
  await authFetch(`${process.env.NEXT_PUBLIC_API_URL}/closed-dates`, {
    method: "POST",
    body: JSON.stringify(data),
  });
};

export const updateClosedDate = async (
  id: number,
  data: UpdateClosedDateData,
): Promise<ClosedDate> => {
  const response = await authFetch(
    `${process.env.NEXT_PUBLIC_API_URL}/closed-dates/${id}`,
    {
      method: "PUT",
      body: JSON.stringify(data),
    },
  );
  return response.data;
};

export const getClosedDateActivities = async (
  page: number = 1,
  perPage: number = 5,
): Promise<PaginatedClosedDateActivities> => {
  const response = await authFetch(
    `${process.env.NEXT_PUBLIC_API_URL}/closed-dates/activity?page=${page}&per_page=${perPage}`,
  );

  const paginatedData = response.data;

  return {
    data: paginatedData?.data || [],
    current_page: paginatedData?.current_page || 1,
    last_page: paginatedData?.last_page || 1,
    per_page: paginatedData?.per_page || perPage,
    total: paginatedData?.total || 0,
  };
};

export const checkClosedDateConflicts = async (
  date: string,
  closureScope: "shop" | "barber" = "shop",
  barberUserId?: number,
): Promise<{ count: number }> => {
  const params = new URLSearchParams({
    date,
    closure_scope: closureScope,
  });
  if (barberUserId) params.set("barber_user_id", String(barberUserId));

  const response = await authFetch(
    `${process.env.NEXT_PUBLIC_API_URL}/closed-dates/check-conflicts?${params.toString()}`,
  );
  return response.data?.data ?? { count: 0 };
};
