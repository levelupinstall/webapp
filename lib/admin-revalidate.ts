import { revalidatePath } from "next/cache";

/** Invalidate the admin CRM route cache after structured Job status changes. */
export function revalidateAdminDashboard(): void {
  revalidatePath("/admin");
}

export function revalidateAdminJobProfile(jobId: string): void {
  const id = jobId.trim();
  if (!id) return;
  revalidatePath(`/admin/jobs/${id}/profile`);
}

/** Dashboard + job profile (after structured-job mutations). */
export function revalidateAdminStructuredJobViews(jobId: string): void {
  revalidateAdminDashboard();
  revalidateAdminJobProfile(jobId);
}
