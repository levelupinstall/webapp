/**
 * Publish a text post to a Facebook Page via Graph API.
 * Requires META_PAGE_ID and META_PAGE_ACCESS_TOKEN (page access token with pages_manage_posts).
 */
export async function publishFacebookPageFeedPost(message: string): Promise<{
  id?: string;
  error?: string;
}> {
  const pageId = process.env.META_PAGE_ID?.trim();
  const token = process.env.META_PAGE_ACCESS_TOKEN?.trim();
  if (!pageId || !token) {
    return { error: "Facebook Page posting is not configured (META_PAGE_ID / META_PAGE_ACCESS_TOKEN)." };
  }

  const trimmed = message.trim();
  if (!trimmed) {
    return { error: "Post message is empty." };
  }

  const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(pageId)}/feed`;
  const body = new URLSearchParams({
    access_token: token,
    message: trimmed,
  });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const json = (await res.json()) as { id?: string; error?: { message?: string } };
  if (!res.ok || json.error) {
    return {
      error: json.error?.message || `Facebook API error (${res.status}).`,
    };
  }
  if (!json.id) {
    return { error: "Facebook did not return a post id." };
  }
  return { id: json.id };
}
