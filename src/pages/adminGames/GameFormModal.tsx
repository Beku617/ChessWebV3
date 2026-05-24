import { useEffect, useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";
import { useTranslation, Trans } from "react-i18next";
import {
  AdminGame,
  AdminUserOption,
  DEFAULT_GAME_FORM,
  GAME_RESULT_OPTIONS,
  GameFormData,
  gameToForm,
} from "./types";

interface GameFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (formData: GameFormData) => Promise<void> | void;
  editingGame: AdminGame | null;
  users: AdminUserOption[];
  saving: boolean;
}

function normalizeNumberInput(value: string): number | "" {
  if (value.trim() === "") return "";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : "";
}

export function GameFormModal({
  isOpen,
  onClose,
  onSubmit,
  editingGame,
  users,
  saving,
}: GameFormModalProps) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<GameFormData>(DEFAULT_GAME_FORM);
  const userListId = useMemo(
    () => `admin-game-users-${Math.random().toString(36).slice(2)}`,
    [],
  );

  useEffect(() => {
    if (!isOpen) return;
    if (editingGame) {
      setFormData(gameToForm(editingGame));
      return;
    }
    const defaultUserId = users[0]?._id || "";
    setFormData({ ...DEFAULT_GAME_FORM, userId: defaultUserId });
  }, [isOpen, editingGame]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit({
      ...formData,
      userId: formData.userId.trim(),
      white: formData.white.trim(),
      black: formData.black.trim(),
      result: formData.result.trim(),
      event: formData.event.trim(),
      site: formData.site.trim(),
      date: formData.date.trim(),
      timeControl: formData.timeControl.trim(),
      opponent: formData.opponent.trim(),
      termination: formData.termination.trim(),
      moveText: formData.moveText.trim(),
      pgn: formData.pgn.trim(),
    });
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-gray-800 shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between p-5 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-gray-200 dark:border-gray-800">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white"> <Trans>Edit Game</Trans> </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5"> <Trans>Manage game data and make it ready for admin analysis.</Trans> </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="p-2 rounded-lg text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="space-y-1.5">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300"> <Trans>Owner User ID *</Trans> </span>
              <input
                list={userListId}
                required
                value={formData.userId}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, userId: e.target.value }))
                }
                placeholder={t("admin.form.ownerUserPlaceholder")}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-slate-800 px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <datalist id={userListId}>
                {users.map((user) => (
                  <option
                    key={user._id}
                    value={user._id}
                    label={`${user.fullName} (${user.email})`}
                  />
                ))}
              </datalist>
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300"> <Trans>Event</Trans> </span>
              <input
                value={formData.event}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, event: e.target.value }))
                }
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-slate-800 px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300"> <Trans>White *</Trans> </span>
              <input
                required
                value={formData.white}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, white: e.target.value }))
                }
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-slate-800 px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300"> <Trans>Black *</Trans> </span>
              <input
                required
                value={formData.black}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, black: e.target.value }))
                }
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-slate-800 px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300"> <Trans>Result *</Trans> </span>
              <select
                required
                value={formData.result}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, result: e.target.value }))
                }
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-slate-800 px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {GAME_RESULT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300"> <Trans>Play As *</Trans> </span>
              <select
                required
                value={formData.playAs}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    playAs: e.target.value as "white" | "black",
                  }))
                }
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-slate-800 px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="white"><Trans>White</Trans></option>
                <option value="black"><Trans>Black</Trans></option>
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300"> <Trans>Variant</Trans> </span>
              <select
                value={formData.variant}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    variant: e.target.value as "standard" | "chess960",
                  }))
                }
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-slate-800 px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="standard"><Trans>Standard</Trans></option>
                <option value="chess960"><Trans>Chess960</Trans></option>
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300"> <Trans>Time Control</Trans> </span>
              <input
                value={formData.timeControl}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    timeControl: e.target.value,
                  }))
                }
                placeholder="e.g. 300+0"
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-slate-800 px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300"> <Trans>White Elo</Trans> </span>
              <input
                type="number"
                value={formData.whiteElo}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    whiteElo: normalizeNumberInput(e.target.value),
                  }))
                }
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-slate-800 px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300"> <Trans>Black Elo</Trans> </span>
              <input
                type="number"
                value={formData.blackElo}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    blackElo: normalizeNumberInput(e.target.value),
                  }))
                }
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-slate-800 px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300"> <Trans>Opponent</Trans> </span>
              <input
                value={formData.opponent}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    opponent: e.target.value,
                  }))
                }
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-slate-800 px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300"> <Trans>Opponent Level</Trans> </span>
              <input
                type="number"
                value={formData.opponentLevel}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    opponentLevel: normalizeNumberInput(e.target.value),
                  }))
                }
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-slate-800 px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300"> <Trans>Site</Trans> </span>
              <input
                value={formData.site}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, site: e.target.value }))
                }
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-slate-800 px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300"> <Trans>Date (PGN)</Trans> </span>
              <input
                value={formData.date}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, date: e.target.value }))
                }
                placeholder="YYYY.MM.DD"
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-slate-800 px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={formData.rated}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, rated: e.target.checked }))
              }
              className="w-4 h-4 rounded border-gray-300 dark:border-gray-700 text-brand-500 focus:ring-brand-500"
            /> <Trans>Rated Game</Trans> </label>

          <label className="space-y-1.5 block">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300"> <Trans>Termination</Trans> </span>
            <input
              value={formData.termination}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  termination: e.target.value,
                }))
              }
              placeholder="checkmate, resign, timeout..."
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-slate-800 px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </label>

          <label className="space-y-1.5 block">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300"> <Trans>Moves (space/newline separated SAN)</Trans> </span>
            <textarea
              value={formData.movesText}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  movesText: e.target.value,
                }))
              }
              rows={4}
              placeholder="e4 e5 Nf3 Nc6 ..."
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-slate-800 px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </label>

          <label className="space-y-1.5 block">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300"> <Trans>Move Text (optional)</Trans> </span>
            <textarea
              value={formData.moveText}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  moveText: e.target.value,
                }))
              }
              rows={3}
              placeholder="1. e4 e5 2. Nf3 ..."
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-slate-800 px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </label>

          <label className="space-y-1.5 block">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300"> <Trans>PGN (optional)</Trans> </span>
            <textarea
              value={formData.pgn}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, pgn: e.target.value }))
              }
              rows={6}
              placeholder={t("admin.form.pgnPlaceholder")}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-slate-800 px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono text-xs"
            />
          </label>

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-200 dark:border-gray-800">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-40"
            > <Trans>Cancel</Trans> </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-brand-500 to-brand-500 text-white font-medium hover:from-brand-600 hover:to-brand-600 transition-colors disabled:opacity-50"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} <Trans>Save Changes</Trans> </button>
          </div>
        </form>
      </div>
    </div>
  );
}

