"use client";

const SUPPORT_FORM_URL = "https://campus-calendar.launchfy.site/ja/form";

export function openSupportForm(params: Record<string, string>) {
  const url = new URL(SUPPORT_FORM_URL);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  window.open(url.toString(), "_blank", "noopener,noreferrer");
}
