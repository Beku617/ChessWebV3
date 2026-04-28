export function isAnalyzePath(pathname: string): boolean {
  const normalized = String(pathname || "").toLowerCase();
  return (
    normalized.startsWith("/analyze/") ||
    normalized.startsWith("/analyze960/") ||
    normalized.startsWith("/admin/analyze/")
  );
}

function normalizeAnalyzeTarget(pathOrUrl: string): string {
  const raw = String(pathOrUrl || "").trim();
  if (!raw) return "";

  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
      return "";
    }
  }

  if (raw.startsWith("/")) return raw;
  return `/${raw.replace(/^\/+/, "")}`;
}

export function openAnalyzeWindow(pathOrUrl: string): boolean {
  if (typeof window === "undefined") return false;
  const target = normalizeAnalyzeTarget(pathOrUrl);
  if (!target || !isAnalyzePath(target)) return false;
  const opened = window.open(target, "_blank", "noopener,noreferrer");
  if (opened) {
    opened.opener = null;
    return true;
  }
  return false;
}
