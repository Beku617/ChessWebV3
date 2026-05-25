import { Copy, Check, Download, BarChart2 } from "lucide-react";
import { useTranslation } from "react-i18next";

interface GameCardActionsProps {
  copied: boolean;
  onAnalyze: (e: React.MouseEvent) => void;
  onCopyPgn: (e: React.MouseEvent) => void;
  onDownloadPgn: (e: React.MouseEvent) => void;
}

export function GameCardActions({
  copied,
  onAnalyze,
  onCopyPgn,
  onDownloadPgn,
}: GameCardActionsProps) {
  const { t } = useTranslation();
  return (
    <div className="flex justify-end gap-3">
      <button
        onClick={onAnalyze}
        className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-purple-600 text-theme-on-accent rounded-lg hover:bg-purple-500 transition-colors shadow-lg shadow-purple-500/20"
      >
        <BarChart2 size={16} />
        {t("profileGames.card.analyze", "Analyze")}
      </button>
      <button
        onClick={onCopyPgn}
        className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-theme-panel border border-theme-glass rounded-lg hover:bg-theme-surface transition-colors text-theme-muted"
      >
        {copied ? (
          <Check size={16} className="text-green-500" />
        ) : (
          <Copy size={16} />
        )}
        {copied
          ? t("profileGames.card.pgnCopied", "PGN Copied")
          : t("profileGames.card.copyPgn", "Copy PGN")}
      </button>
      <button
        onClick={onDownloadPgn}
        className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-brand-600 text-theme-on-accent rounded-lg hover:bg-brand-500 transition-colors shadow-lg shadow-brand-500/20"
      >
        <Download size={16} />
        {t("profileGames.card.downloadFile", "Download File")}
      </button>
    </div>
  );
}

