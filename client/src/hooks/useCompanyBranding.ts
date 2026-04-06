import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

const DEFAULT_FAVICON_HREF = "/favicon.png";
const DEFAULT_FAVICON_TYPE = "image/png";
/** Document title before login and when company title is unset */
export const DEFAULT_BROWSER_TITLE = "TaskFlow";

type CompanyBrandingDto = {
  logoUrl: string | null;
  browserTitle?: string;
};

function mimeFromLogoPath(url: string): string {
  const path = url.split("?")[0].toLowerCase();
  if (path.endsWith(".webp")) return "image/webp";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  return "image/png";
}

function getOrCreateFaviconLink(): HTMLLinkElement {
  const existing = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (existing) return existing;
  const link = document.createElement("link");
  link.rel = "icon";
  document.head.appendChild(link);
  return link;
}

/**
 * While the user is logged in, apply company logo (favicon) and browser tab title
 * from settings; restore defaults on logout (hook unmount).
 */
export function useCompanyBranding() {
  const { data } = useQuery<CompanyBrandingDto>({
    queryKey: ["/api/company-settings"],
  });

  useEffect(() => {
    const link = getOrCreateFaviconLink();
    const logo = data?.logoUrl?.trim();
    if (logo) {
      link.href = logo;
      link.type = mimeFromLogoPath(logo);
    } else {
      link.href = DEFAULT_FAVICON_HREF;
      link.type = DEFAULT_FAVICON_TYPE;
    }
  }, [data?.logoUrl]);

  useEffect(() => {
    const custom = data?.browserTitle?.trim();
    document.title = custom && custom.length > 0 ? custom : DEFAULT_BROWSER_TITLE;
  }, [data?.browserTitle]);

  useEffect(() => {
    return () => {
      const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (link) {
        link.href = DEFAULT_FAVICON_HREF;
        link.type = DEFAULT_FAVICON_TYPE;
      }
      document.title = DEFAULT_BROWSER_TITLE;
    };
  }, []);
}
