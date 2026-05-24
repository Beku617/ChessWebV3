import { ChangeEvent, useMemo, useState } from "react";
import { ArrowLeft, FileUp, Loader2, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { API_URL } from "../../config/network";
import type { GameHistory } from "../../historyTypes";
import { ReplayContent } from "../analyze/ReplayContent";

type ParsePgnResponse = {
  game?: GameHistory;
  moveCount?: number;
  normalizedPgn?: string;
  error?: string;
};

function getErrorMessage(payload: ParsePgnResponse | null, fallback: string) {
  const message = String(payload?.error || "").trim();
  return message || fallback;
}

type PracticePgnImportProps = {
  embedded?: boolean;
  onRequestClose?: () => void;
};

export function PracticePgnImport({
  embedded = false,
  onRequestClose,
}: PracticePgnImportProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [pgnText, setPgnText] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [sourceFileName, setSourceFileName] = useState<string | null>(null);
  const [parsedGame, setParsedGame] = useState<GameHistory | null>(null);

  const canSubmit = useMemo(
    () => !isParsing && pgnText.trim().length > 0,
    [isParsing, pgnText],
  );

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const text = await file.text();
      setPgnText(text);
      setSourceFileName(file.name);
      setError(null);
      setStatus(
        t("practice.pgn.status.loadedFile", {
          fileName: file.name,
          defaultValue: `Loaded ${file.name}.`,
        }),
      );
    } catch {
      setError(
        t(
          "practice.pgn.errors.unableToReadFile",
          "Unable to read the selected PGN file.",
        ),
      );
      setStatus(null);
    }
  };

  const handleParsePgn = async () => {
    const trimmed = pgnText.trim();
    if (!trimmed) {
      setError(
        t(
          "practice.pgn.errors.emptyInput",
          "Paste PGN text or upload a PGN file first.",
        ),
      );
      return;
    }

    setIsParsing(true);
    setError(null);
    setStatus(null);

    try {
      const response = await fetch(`${API_URL}/api/pgn/parse`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pgn: trimmed }),
      });

      const payload = (await response.json().catch(() => null)) as
        | ParsePgnResponse
        | null;

      if (!response.ok) {
        throw new Error(
          getErrorMessage(
            payload,
            t(
              "practice.pgn.errors.parseFailed",
              "PGN parsing failed. Please verify the file.",
            ),
          ),
        );
      }

      if (!payload?.game) {
        throw new Error(
          t(
            "practice.pgn.errors.noGamePayload",
            "PGN parsed but no analysis game payload was returned.",
          ),
        );
      }

      setParsedGame(payload.game);
      setPgnText(payload.normalizedPgn || trimmed);
      setStatus(
        typeof payload.moveCount === "number"
          ? t("practice.pgn.status.parsedPlies", {
              count: payload.moveCount,
              defaultValue: `Parsed ${payload.moveCount} plies.`,
            })
          : t(
              "practice.pgn.status.parsedSuccess",
              "PGN parsed successfully.",
            ),
      );
    } catch (parseError) {
      setError(
        parseError instanceof Error
          ? parseError.message
          : t(
              "practice.pgn.errors.parseFailed",
              "PGN parsing failed. Please verify the file.",
            ),
      );
    } finally {
      setIsParsing(false);
    }
  };

  if (parsedGame) {
    return (
      <ReplayContent
        game={parsedGame}
        onBack={() => {
          setParsedGame(null);
          setError(null);
        }}
      />
    );
  }

  const containerClass = embedded
    ? "h-full min-h-0 overflow-y-auto bg-transparent"
    : "h-full min-h-0 overflow-y-auto bg-slate-100 dark:bg-slate-950";
  const shellClass = embedded
    ? "relative w-full h-full px-3 py-3 sm:px-4 sm:py-4"
    : "mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8";

  return (
    <div className={containerClass}>
      <div className={shellClass}>
        {!embedded && (
          <div className="mb-5 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => navigate("/play/practice")}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
            >
              <ArrowLeft size={16} />
              {t("practice.pgn.backToPractice", "Back to Practice")}
            </button>
            <h1 className="text-base font-semibold text-slate-900 dark:text-slate-100 sm:text-lg">
              {t("practice.pgn.title", "PGN Import / Analysis")}
            </h1>
          </div>
        )}

        <div className={embedded ? "grid h-full" : "grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]"}>
          <section
            className={
              embedded
                ? "relative flex h-full min-h-0 flex-col p-4 sm:p-5"
                : "rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-4"
            }
          >
            {embedded && (
              <button
                type="button"
                onClick={onRequestClose}
                className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-600 bg-[#0b1220] text-slate-300 transition-colors hover:bg-slate-800 hover:text-slate-100"
                aria-label={t("practice.pgn.close", "Close PGN window")}
              >
                <X size={14} />
              </button>
            )}

            <div className={embedded ? "mb-3 flex items-center justify-between gap-3 pr-9" : "mb-3 flex items-center justify-between gap-3"}>
              <p className={embedded ? "text-base font-semibold text-slate-100" : "text-sm font-semibold text-slate-900 dark:text-slate-100"}>
                {t("practice.pgn.pasteLabel", "Paste PGN")}
              </p>
              <label
                className={
                  embedded
                    ? "inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-600 bg-[#0b1220] px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-800"
                    : "inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                }
              >
                <FileUp size={14} />
                {t("practice.pgn.uploadButton", "Upload .pgn")}
                <input
                  type="file"
                  accept=".pgn,text/plain"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </label>
            </div>

            <textarea
              value={pgnText}
              onChange={(event) => setPgnText(event.target.value)}
              placeholder={t(
                "practice.pgn.placeholder",
                '[Event "Practice"]\n[Site "NeonGambit"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6',
              )}
              spellCheck={false}
              className={
                embedded
                  ? "h-[250px] w-full resize-none overflow-y-auto rounded-xl border border-slate-700 bg-[#020617] p-4 font-mono text-sm text-slate-100 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
                  : "h-[360px] w-full resize-none rounded-xl border border-slate-300 bg-slate-50 p-3 font-mono text-xs text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 sm:h-[420px]"
              }
            />

            {sourceFileName && (
              <p className={embedded ? "mt-2 text-xs text-slate-400" : "mt-2 text-xs text-slate-500 dark:text-slate-400"}>
                {t("practice.pgn.sourceFile", {
                  fileName: sourceFileName,
                  defaultValue: `Source file: ${sourceFileName}`,
                })}
              </p>
            )}

            {error && (
              <p
                className={
                  embedded
                    ? "mt-3 rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2 text-xs font-medium text-red-300"
                    : "mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
                }
              >
                {error}
              </p>
            )}

            {status && !error && (
              <p
                className={
                  embedded
                    ? "mt-3 rounded-lg border border-emerald-900/50 bg-emerald-950/30 px-3 py-2 text-xs font-medium text-emerald-300"
                    : "mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300"
                }
              >
                {status}
              </p>
            )}

            {embedded && (
              <div className="mt-auto grid gap-2 pt-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={handleParsePgn}
                  disabled={!canSubmit}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0e7490] px-3 text-sm font-medium text-white transition hover:bg-[#0f85a7] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isParsing ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      {t("practice.pgn.parsing", "Parsing PGN...")}
                    </>
                  ) : (
                    t("practice.pgn.openInAnalysisBoard", "Open in Analysis Board")
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPgnText("");
                    setParsedGame(null);
                    setError(null);
                    setStatus(null);
                    setSourceFileName(null);
                  }}
                  className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-slate-600 bg-[#0b1220] px-3 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-800"
                >
                  {t("practice.pgn.clearInput", "Clear Input")}
                </button>
              </div>
            )}
          </section>

          {!embedded && (
            <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {t("practice.pgn.importOptions", "Import Options")}
              </h2>
              <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-400">
                {t(
                  "practice.pgn.importHelp",
                  "Paste PGN text directly or upload a .pgn file, then parse it into the analysis board.",
                )}
              </p>

              <button
                type="button"
                onClick={handleParsePgn}
                disabled={!canSubmit}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isParsing ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    {t("practice.pgn.parsing", "Parsing PGN...")}
                  </>
                ) : (
                  t("practice.pgn.openInAnalysisBoard", "Open in Analysis Board")
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setPgnText("");
                  setParsedGame(null);
                  setError(null);
                  setStatus(null);
                  setSourceFileName(null);
                }}
                className="mt-2 inline-flex w-full items-center justify-center rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {t("practice.pgn.clearInput", "Clear Input")}
              </button>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}

export default PracticePgnImport;
