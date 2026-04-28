import { useEffect, useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  AdminTournamentOrganizer,
  AdminTournamentSummary,
  DEFAULT_TOURNAMENT_FORM,
  getLocalDateTimeMinimum,
  TIME_PRESETS,
  TournamentFormData,
  tournamentToForm,
} from "./types";

interface TournamentFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (formData: TournamentFormData) => Promise<void> | void;
  editingTournament: AdminTournamentSummary | null;
  users: AdminTournamentOrganizer[];
  saving: boolean;
}

export function TournamentFormModal({
  isOpen,
  onClose,
  onSubmit,
  editingTournament,
  users,
  saving,
}: TournamentFormModalProps) {
  const [formData, setFormData] = useState<TournamentFormData>(
    DEFAULT_TOURNAMENT_FORM,
  );
  const { t } = useTranslation();
  const userListId = useMemo(
    () => `admin-tournament-users-${Math.random().toString(36).slice(2)}`,
    [],
  );

  useEffect(() => {
    if (!isOpen) return;

    if (editingTournament) {
      setFormData(tournamentToForm(editingTournament));
      return;
    }

    setFormData((current) => ({
      ...DEFAULT_TOURNAMENT_FORM,
      organizerUserId: current.organizerUserId || users[0]?._id || "",
    }));
  }, [editingTournament, isOpen, users]);

  if (!isOpen) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    await onSubmit({
      ...formData,
      organizerUserId: formData.organizerUserId.trim(),
      name: formData.name.trim(),
      setup: formData.setup.trim(),
      pairingLogic: formData.pairingLogic.trim(),
      durationMinutes: formData.durationMinutes.trim(),
      timezone: formData.timezone.trim(),
      roundsPlanned: formData.roundsPlanned.trim(),
      customBaseMinutes: formData.customBaseMinutes.trim(),
      customIncrementSeconds: formData.customIncrementSeconds.trim(),
      minPlayers: formData.minPlayers.trim(),
      maxPlayers: formData.maxPlayers.trim(),
      ratingMin: formData.ratingMin.trim(),
      ratingMax: formData.ratingMax.trim(),
      registrationDeadline: formData.registrationDeadline.trim(),
      scheduledStartAt: formData.scheduledStartAt.trim(),
      description: formData.description.trim(),
    });
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-gray-800 shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between p-5 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-gray-200 dark:border-gray-800">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              {editingTournament
                ? t("adminTournaments.modal.titleEdit", "Edit Tournament")
                : t("adminTournaments.modal.titleCreate", "Create Tournament")}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {t(
                "adminTournaments.modal.subtitle",
                "Configure organizer, time control, player limits, and lifecycle settings.",
              )}
            </p>
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
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t("adminTournaments.modal.fields.organizerUserId", "Organizer User ID")} *
              </span>
              <input
                list={userListId}
                required
                value={formData.organizerUserId}
                onChange={(event) =>
                  setFormData((current) => ({
                    ...current,
                    organizerUserId: event.target.value,
                  }))
                }
                placeholder={t(
                  "adminTournaments.modal.placeholders.organizerUserId",
                  "Paste user id or pick from list",
                )}
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
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t("adminTournaments.modal.fields.name", "Tournament Name")} *
              </span>
              <input
                required
                value={formData.name}
                onChange={(event) =>
                  setFormData((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder={t(
                  "adminTournaments.modal.placeholders.name",
                  "Club Championship",
                )}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-slate-800 px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t("adminTournaments.modal.fields.format", "Format")}
              </span>
              <select
                value={formData.type}
                onChange={(event) =>
                  setFormData((current) => ({
                    ...current,
                    type: event.target.value as TournamentFormData["type"],
                  }))
                }
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-slate-800 px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="swiss">
                  {t("tournamentCommon.formats.swiss", "Swiss")}
                </option>
                <option value="arena">
                  {t("tournamentCommon.formats.arena", "Arena")}
                </option>
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {formData.type === "arena"
                  ? t("adminTournaments.modal.fields.duration", "Duration")
                  : t("adminTournaments.modal.fields.roundsPlanned", "Planned Rounds")}
              </span>
              {formData.type === "arena" ? (
                <select
                  value={formData.durationMinutes}
                  onChange={(event) =>
                    setFormData((current) => ({
                      ...current,
                      durationMinutes: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-slate-800 px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  {[10, 15, 30, 45, 60, 90, 120].map((minutes) => (
                    <option key={minutes} value={String(minutes)}>
                      {t("adminTournaments.modal.durationMinutes", {
                        count: minutes,
                        defaultValue: `${minutes} min`,
                      })}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="number"
                  min={1}
                  value={formData.roundsPlanned}
                  onChange={(event) =>
                    setFormData((current) => ({
                      ...current,
                      roundsPlanned: event.target.value,
                    }))
                  }
                  placeholder={t(
                    "adminTournaments.modal.placeholders.roundsRequired",
                    "7",
                  )}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-slate-800 px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              )}
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t("adminTournaments.modal.fields.gameType", "Game Type")}
              </span>
              <select
                value={formData.gameType}
                onChange={(event) =>
                  setFormData((current) => ({
                    ...current,
                    gameType: event.target.value as TournamentFormData["gameType"],
                  }))
                }
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-slate-800 px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="standard">
                  {t("tournamentsPage.create.gameTypes.standard", "Standard")}
                </option>
                <option value="chess960">
                  {t("tournamentsPage.create.gameTypes.chess960", "Chess960")}
                </option>
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t("adminTournaments.modal.fields.setup", "Setup")}
              </span>
              <select
                value={formData.setup}
                onChange={(event) =>
                  setFormData((current) => ({
                    ...current,
                    setup: event.target.value,
                  }))
                }
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-slate-800 px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="standard">
                  {t("tournamentsPage.create.setup.standard", "Standard")}
                </option>
              </select>
            </label>

            {formData.type === "arena" && (
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t("adminTournaments.modal.fields.pairingLogic", "Pairing Logic")}
                </span>
                <select
                  value={formData.pairingLogic}
                  onChange={(event) =>
                    setFormData((current) => ({
                      ...current,
                      pairingLogic: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-slate-800 px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="rating-based">
                    {t("tournamentsPage.create.pairing.ratingBased", "Rating-based")}
                  </option>
                  <option value="point-based">
                    {t("tournamentsPage.create.pairing.pointBased", "Point-based")}
                  </option>
                </select>
              </label>
            )}

            <div className="flex items-center justify-between rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-slate-800">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t("adminTournaments.modal.fields.rated", "Rated")}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={formData.rated}
                onClick={() =>
                  setFormData((current) => ({
                    ...current,
                    rated: !current.rated,
                  }))
                }
                className={`relative inline-flex h-7 w-12 items-center rounded-full border border-gray-300 transition-colors dark:border-gray-700 ${
                  formData.rated ? "bg-brand-500" : "bg-gray-300 dark:bg-slate-700"
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 rounded-full bg-white transition-transform ${
                    formData.rated ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            <label className="space-y-1.5 md:col-span-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t("adminTournaments.modal.fields.timeControl", "Time Control")}
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <select
                  value={formData.timePreset}
                  onChange={(event) =>
                    setFormData((current) => ({
                      ...current,
                      timePreset: event.target.value,
                    }))
                  }
                  className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-slate-800 px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  {TIME_PRESETS.map((preset) => (
                    <option key={preset.key} value={preset.key}>
                      {t(`tournamentCommon.timePresets.${preset.key}`, preset.label)}
                    </option>
                  ))}
                </select>

                {formData.timePreset === "custom" && (
                  <>
                    <input
                      type="number"
                      min={1}
                      value={formData.customBaseMinutes}
                      onChange={(event) =>
                        setFormData((current) => ({
                          ...current,
                          customBaseMinutes: event.target.value,
                        }))
                      }
                      placeholder={t(
                        "adminTournaments.modal.placeholders.baseMinutes",
                        "Base minutes",
                      )}
                      className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-slate-800 px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                    <input
                      type="number"
                      min={0}
                      value={formData.customIncrementSeconds}
                      onChange={(event) =>
                        setFormData((current) => ({
                          ...current,
                          customIncrementSeconds: event.target.value,
                        }))
                      }
                      placeholder={t(
                        "adminTournaments.modal.placeholders.incrementSeconds",
                        "Increment seconds",
                      )}
                      className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-slate-800 px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </>
                )}
              </div>
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t("adminTournaments.modal.fields.minPlayers", "Min Players")}
              </span>
              <input
                type="number"
                min={2}
                value={formData.minPlayers}
                onChange={(event) =>
                  setFormData((current) => ({
                    ...current,
                    minPlayers: event.target.value,
                  }))
                }
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-slate-800 px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t("adminTournaments.modal.fields.maxPlayers", "Max Players")}
              </span>
              <input
                type="number"
                min={2}
                value={formData.maxPlayers}
                onChange={(event) =>
                  setFormData((current) => ({
                    ...current,
                    maxPlayers: event.target.value,
                  }))
                }
                placeholder={t("tournamentCommon.generic.optional", "Optional")}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-slate-800 px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </label>

            <label className="space-y-1.5 md:col-span-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t("adminTournaments.modal.fields.ratingFilter", "Rating Filter")}
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <select
                  value={formData.ratingFilterMode}
                  onChange={(event) =>
                    setFormData((current) => ({
                      ...current,
                      ratingFilterMode: event.target
                        .value as TournamentFormData["ratingFilterMode"],
                    }))
                  }
                  className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-slate-800 px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="none">
                    {t("tournamentCommon.ratingFilter.none", "None")}
                  </option>
                  <option value="min">
                    {t("tournamentCommon.ratingFilter.min", "Min Only")}
                  </option>
                  <option value="max">
                    {t("tournamentCommon.ratingFilter.max", "Max Only")}
                  </option>
                  <option value="range">
                    {t("tournamentCommon.ratingFilter.range", "Range")}
                  </option>
                </select>

                {(formData.ratingFilterMode === "min" ||
                  formData.ratingFilterMode === "range") && (
                  <input
                    type="number"
                    min={0}
                    value={formData.ratingMin}
                    onChange={(event) =>
                      setFormData((current) => ({
                        ...current,
                        ratingMin: event.target.value,
                      }))
                    }
                    placeholder={t(
                      "adminTournaments.modal.placeholders.minRating",
                      "Min rating",
                    )}
                    className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-slate-800 px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                )}

                {(formData.ratingFilterMode === "max" ||
                  formData.ratingFilterMode === "range") && (
                  <input
                    type="number"
                    min={0}
                    value={formData.ratingMax}
                    onChange={(event) =>
                      setFormData((current) => ({
                        ...current,
                        ratingMax: event.target.value,
                      }))
                    }
                    placeholder={t(
                      "adminTournaments.modal.placeholders.maxRating",
                      "Max rating",
                    )}
                    className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-slate-800 px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                )}
              </div>
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t(
                  "adminTournaments.modal.fields.registrationDeadline",
                  "Registration Deadline",
                )}
              </span>
              <input
                type="datetime-local"
                value={formData.registrationDeadline}
                onChange={(event) =>
                  setFormData((current) => ({
                    ...current,
                    registrationDeadline: event.target.value,
                  }))
                }
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-slate-800 px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t("adminTournaments.modal.fields.startType", "Start Type")}
              </span>
              <select
                value={formData.startType}
                onChange={(event) =>
                  setFormData((current) => ({
                    ...current,
                    startType: event.target.value as TournamentFormData["startType"],
                  }))
                }
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-slate-800 px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="manual">
                  {t("tournamentCommon.startType.manual", "Manual")}
                </option>
                <option value="scheduled">
                  {t("tournamentCommon.startType.scheduled", "Scheduled")}
                </option>
              </select>
            </label>

            {formData.startType === "scheduled" && (
              <label className="space-y-1.5 md:col-span-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t(
                    "adminTournaments.modal.fields.scheduledStart",
                    "Scheduled Start",
                  )}
                </span>
                <input
                  type="datetime-local"
                  min={getLocalDateTimeMinimum()}
                  value={formData.scheduledStartAt}
                  onChange={(event) =>
                    setFormData((current) => ({
                      ...current,
                      scheduledStartAt: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-slate-800 px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </label>
            )}
          </div>

          <label className="space-y-1.5 block">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {t("adminTournaments.modal.fields.description", "Description")}
            </span>
            <textarea
              value={formData.description}
              onChange={(event) =>
                setFormData((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              rows={4}
              placeholder={t(
                "adminTournaments.modal.placeholders.description",
                "Optional tournament notes",
              )}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-slate-800 px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </label>

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-200 dark:border-gray-800">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-40"
            >
              {t("common.cancel", "Cancel")}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-brand-500 to-brand-500 text-white font-medium hover:from-brand-600 hover:to-brand-600 transition-colors disabled:opacity-50"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {editingTournament
                ? t("adminTournaments.modal.saveChanges", "Save Changes")
                : t("adminTournaments.modal.submitCreate", "Create Tournament")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
