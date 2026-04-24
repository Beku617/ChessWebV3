import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Check,
  Eye,
  Loader2,
  Pencil,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { AdminPagination } from "../../components/AdminPagination";
import AdminSidebar from "../../components/AdminSidebar";
import { useAdminStore } from "../../store/adminStore";
import { TournamentFormModal } from "./TournamentFormModal";
import { useAdminTournaments } from "./useAdminTournaments";
import {
  AdminTournamentDetailResponse,
  AdminTournamentSummary,
  TournamentFormData,
  TournamentStatus,
} from "./types";

type ConfirmDialogState = {
  message: string;
  confirmLabel: string;
  tone?: "danger" | "warning";
  onConfirm: () => Promise<void> | void;
};

type DetailActionId =
  | "open_registration"
  | "next_round"
  | "finish_tournament"
  | "close_round";

type DetailAction = {
  id: DetailActionId;
  tone: "brand" | "success" | "warning" | "danger";
};

const panelClassName =
  "rounded-xl border border-gray-200/80 bg-white/95 dark:border-white/10 dark:bg-slate-900/95";
const inputClassName =
  "h-11 rounded-lg border border-gray-200/80 bg-gray-50/80 px-3 text-sm text-gray-900 outline-none transition focus:border-[#a855f7]/60 focus:ring-2 focus:ring-[#a855f7]/20 dark:border-white/10 dark:bg-slate-950/70 dark:text-white";
const tableHeadingClass =
  "px-3 py-3 text-left text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-slate-400";
const sectionTitleClass = "text-base font-semibold text-gray-900 dark:text-white";
const labelClassName =
  "text-xs font-medium uppercase tracking-[0.18em] text-gray-500 dark:text-slate-400";

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function statusBadgeClass(status: TournamentStatus) {
  if (status === "REGISTRATION_OPEN") {
    return "border border-emerald-500/30 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300";
  }
  if (
    status === "LIVE_ROUND" ||
    status === "ROUND_CLOSED"
  ) {
    return "border border-amber-400/30 bg-amber-400/10 text-amber-700 dark:text-amber-200";
  }
  if (status === "FINISHED") {
    return "border border-slate-400/20 bg-slate-400/10 text-slate-700 dark:text-slate-300";
  }
  return "border border-[#a855f7]/25 bg-[#a855f7]/10 text-[#7e22ce] dark:text-[#d8b4fe]";
}

function typeBadgeClass(type: AdminTournamentSummary["type"]) {
  void type;
  return "border border-[#a855f7]/20 bg-[#a855f7]/10 text-[#7e22ce] dark:text-[#d8b4fe]";
}

function buttonToneClass(tone: DetailAction["tone"]) {
  if (tone === "success") {
    return "border border-emerald-400/40 bg-emerald-500/90 text-emerald-950 hover:bg-emerald-400";
  }
  if (tone === "warning") {
    return "border border-amber-400/40 bg-amber-500/90 text-amber-950 hover:bg-amber-400";
  }
  if (tone === "danger") {
    return "border border-red-400/40 bg-red-500/90 text-red-50 hover:bg-red-400";
  }
  return "border border-[#a855f7]/60 bg-[#a855f7] text-white hover:bg-[#9333ea]";
}

function canDeleteTournamentStatus(status: TournamentStatus) {
  return status === "DRAFT" || status === "REGISTRATION_OPEN";
}

function getDetailActions(
  detail: AdminTournamentDetailResponse | null,
): DetailAction[] {
  if (!detail) return [];
  const status = detail.tournament.status;

  if (status === "DRAFT") {
    return [{ id: "open_registration", tone: "brand" }];
  }
  if (status === "REGISTRATION_OPEN") {
    return [];
  }
  if (status === "LIVE_ROUND") {
    return [
      { id: "close_round", tone: "warning" },
      { id: "finish_tournament", tone: "danger" },
    ];
  }
  if (status === "ROUND_CLOSED") {
    return [
      { id: "next_round", tone: "brand" },
      { id: "finish_tournament", tone: "danger" },
    ];
  }
  return [];
}

export default function AdminTournaments() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isAuthenticated, isLoading: authLoading, checkAuth } = useAdminStore();

  const {
    tournaments,
    users,
    pagination,
    selectedId,
    detail,
    loadingList,
    loadingDetail,
    error,
    searchQuery,
    typeFilter,
    statusFilter,
    sortMode,
    setPage,
    setSelectedId,
    setSearchQuery,
    setTypeFilter,
    setStatusFilter,
    setSortMode,
    createTournament,
    updateTournament,
    deleteTournament,
    runTournamentAction,
    closeCurrentRound,
  } = useAdminTournaments({ enabled: isAuthenticated });

  const [showFormModal, setShowFormModal] = useState(false);
  const [editingTournament, setEditingTournament] =
    useState<AdminTournamentSummary | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyAction, setBusyAction] = useState<string>("");
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(
    null,
  );
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate("/login");
    }
  }, [authLoading, isAuthenticated, navigate]);

  const selectedSummary = useMemo(
    () => tournaments.find((tournament) => tournament.id === selectedId) || null,
    [selectedId, tournaments],
  );
  const detailActions = useMemo(() => getDetailActions(detail), [detail]);
  const formatStatusLabel = (status: TournamentStatus) => {
    if (status === "REGISTRATION_OPEN") {
      return t("tournamentCommon.status.registrationOpen", "Registration Open");
    }
    if (status === "LIVE_ROUND") {
      return t("tournamentCommon.status.liveRound", "Live Round");
    }
    if (status === "ROUND_CLOSED") {
      return t("tournamentCommon.status.roundClosed", "Round Closed");
    }
    if (status === "FINISHED") {
      return t("tournamentCommon.status.finished", "Finished");
    }
    return t("tournamentCommon.status.draft", "Draft");
  };
  const formatTypeLabel = (type: AdminTournamentSummary["type"]) => {
    void type;
    return t("tournamentCommon.formats.swiss", "Swiss");
  };
  const formatPlayerStatus = (status: "active" | "withdrawn") =>
    status === "withdrawn"
      ? t("tournamentCommon.playerStatus.withdrawn", "Withdrawn")
      : t("tournamentCommon.playerStatus.active", "Active");
  const formatRatingRequirementLabel = (value?: string | null) => {
    const normalized = String(value || "").trim();
    if (!normalized || /^none$/i.test(normalized)) {
      return t("tournamentCommon.rating.none", "None");
    }
    return normalized;
  };
  const formatStandingsMetaLabel = (label?: string | null) => {
    const normalized = String(label || "").trim();
    if (!normalized) return "";
    if (/^official$/i.test(normalized)) {
      return t("tournamentCommon.standingsMeta.official", "Official");
    }
    if (/^live preview$/i.test(normalized)) {
      return t("tournamentCommon.standingsMeta.livePreview", "Live preview");
    }
    const roundMatch = normalized.match(/official\s*[—-]\s*round\s*(\d+)\s*complete/i);
    if (roundMatch) {
      return t("tournamentCommon.standingsMeta.roundComplete", {
        round: roundMatch[1],
        defaultValue: `Official - Round ${roundMatch[1]} complete`,
      });
    }
    return normalized;
  };
  const getDetailActionLabel = (actionId: DetailActionId) => {
    if (actionId === "open_registration") {
      return t("adminTournaments.actions.openRegistration", "Open Registration");
    }
    if (actionId === "next_round") {
      return t("adminTournaments.actions.startNextRound", "Start Next Round");
    }
    if (actionId === "close_round") {
      return t("adminTournaments.actions.closeCurrentRound", "Close Current Round");
    }
    return t("adminTournaments.actions.finishTournament", "Finish Tournament");
  };
  const detailInfoCards = detail
    ? [
        {
          key: "players",
          label: t("adminTournaments.detailCards.players", "Players"),
          value: t("adminTournaments.values.totalCount", {
            count: detail.players.length,
            defaultValue: `${detail.players.length} total`,
          }),
          meta: t("adminTournaments.values.activeCount", {
            count: detail.players.filter((player) => player.status === "active").length,
            defaultValue: `${detail.players.filter((player) => player.status === "active").length} active`,
          }),
        },
        {
          key: "schedule",
          label: t("adminTournaments.detailCards.schedule", "Schedule"),
          value: detail.tournament.timeControlLabel,
          meta:
            detail.tournament.startType === "scheduled"
              ? t("adminTournaments.values.startsAt", {
                  value: formatDateTime(detail.tournament.scheduledStartAt),
                  defaultValue: `Starts ${formatDateTime(detail.tournament.scheduledStartAt)}`,
                })
              : t("adminTournaments.values.registrationAt", {
                  value: formatDateTime(detail.tournament.registrationDeadline),
                  defaultValue: `Registration ${formatDateTime(detail.tournament.registrationDeadline)}`,
                }),
        },
        {
          key: "rounds",
          label: t("adminTournaments.detailCards.rounds", "Rounds"),
          value: `${detail.tournament.currentRound}/${detail.tournament.roundsPlanned}`,
          meta: t("adminTournaments.values.roundRecords", {
            count: detail.rounds.length,
            defaultValue: `${detail.rounds.length} round records`,
          }),
        },
        {
          key: "rating",
          label: t("adminTournaments.detailCards.ratingGate", "Rating Gate"),
          value: formatRatingRequirementLabel(detail.tournament.ratingRequirement),
          meta: t("adminTournaments.values.minMaxPlayers", {
            min: detail.tournament.minPlayers,
            max:
              detail.tournament.maxPlayers ??
              t("tournamentCommon.generic.noMax", "No max"),
            defaultValue: `${detail.tournament.minPlayers} min / ${
              detail.tournament.maxPlayers ?? t("tournamentCommon.generic.noMax", "No max")
            } max`,
          }),
        },
      ]
    : [];

  const showNotification = (type: "success" | "error", message: string) => {
    setNotification({ type, message });
    window.setTimeout(() => setNotification(null), 3200);
  };

  const handleEditClick = (tournament: AdminTournamentSummary) => {
    setEditingTournament(tournament);
    setShowFormModal(true);
  };

  const handleSubmitTournament = async (formData: TournamentFormData) => {
    setSaving(true);
    try {
      if (editingTournament) {
        await updateTournament(editingTournament.id, formData);
        showNotification(
          "success",
          t(
            "adminTournaments.notifications.tournamentUpdated",
            "Tournament updated successfully",
          ),
        );
      } else {
        await createTournament(formData);
        showNotification(
          "success",
          t(
            "adminTournaments.notifications.tournamentCreated",
            "Tournament created successfully",
          ),
        );
      }
      setShowFormModal(false);
      setEditingTournament(null);
    } catch (err) {
      showNotification(
        "error",
        err instanceof Error
          ? err.message
          : t(
              "adminTournaments.notifications.saveFailed",
              "Failed to save tournament",
            ),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClick = (tournament: { id: string; name: string }) => {
    setConfirmDialog({
      message: t("adminTournaments.confirm.deleteMessage", {
        name: tournament.name,
        defaultValue: `Delete "${tournament.name}"? Only tournaments that have not gone live can be removed.`,
      }),
      confirmLabel: t(
        "adminTournaments.confirm.deleteTournament",
        "Delete Tournament",
      ),
      tone: "danger",
      onConfirm: async () => {
        await deleteTournament(tournament.id);
        showNotification(
          "success",
          t(
            "adminTournaments.notifications.tournamentDeleted",
            "Tournament deleted successfully",
          ),
        );
      },
    });
  };

  const handleRunAction = async (action: DetailAction) => {
    if (!detail) return;

    const execute = async () => {
      setBusyAction(action.id);
      try {
        if (action.id === "close_round") {
          await closeCurrentRound(
            detail.tournament.id,
            detail.tournament.currentRound,
          );
        } else {
          await runTournamentAction(detail.tournament.id, action.id);
        }

        const successMessage =
          action.id === "open_registration"
            ? t("adminTournaments.notifications.registrationOpened", "Registration opened")
            : action.id === "next_round"
              ? t(
                  "adminTournaments.notifications.nextRoundStarted",
                  "Next round started",
                )
                : action.id === "close_round"
                  ? t("adminTournaments.notifications.roundClosed", "Round closed")
                  : t(
                      "adminTournaments.notifications.tournamentFinished",
                      "Tournament finished",
                    );
        showNotification("success", successMessage);
      } catch (err) {
        showNotification(
          "error",
          err instanceof Error
            ? err.message
            : t(
                "adminTournaments.notifications.actionFailed",
                "Tournament action failed",
              ),
        );
      } finally {
        setBusyAction("");
      }
    };

    if (action.id === "finish_tournament") {
      setConfirmDialog({
        message: t(
          "adminTournaments.confirm.finishMessage",
          "Finish this tournament now? This will lock in the final standings.",
        ),
        confirmLabel: t(
          "adminTournaments.confirm.finishTournament",
          "Finish Tournament",
        ),
        tone: "danger",
        onConfirm: execute,
      });
      return;
    }

    await execute();
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] dark:bg-gray-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#a855f7]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f7] dark:bg-gray-950 text-gray-900 dark:text-white">
      <AdminSidebar />

      {notification && (
        <div
          className={`fixed right-5 top-5 z-[90] flex items-center gap-2 rounded-xl px-4 py-3 shadow-lg ${
            notification.type === "success"
              ? "bg-[#a855f7] text-white"
              : "bg-red-500 text-white"
          }`}
        >
          {notification.type === "success" ? (
            <Check className="w-4 h-4" />
          ) : (
            <X className="w-4 h-4" />
          )}
          <span className="text-sm font-medium">{notification.message}</span>
        </div>
      )}

      <main className="ml-72 min-w-0 overflow-x-hidden p-8">
        <div className="space-y-4">
          <div className="flex flex-wrap items-start gap-4">
            <div>
              <h1 className="text-2xl font-bold">
                {t("adminTournaments.title", "Tournament Management")}
              </h1>
            </div>
          </div>

        <div className={`${panelClassName} p-5`}>
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-[240px] flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
                <input
                  value={searchQuery}
                  onChange={(event) => {
                    setSearchQuery(event.target.value);
                    setPage(1);
                  }}
                  placeholder={t(
                    "adminTournaments.filters.searchPlaceholder",
                    "Search by event, organizer, status...",
                  )}
                  className={`${inputClassName} w-full pl-10 pr-3`}
                />
              </div>
            </div>

            <select
              value={typeFilter}
              onChange={(event) => {
                setTypeFilter(event.target.value as "" | AdminTournamentSummary["type"]);
                setPage(1);
              }}
              className={`${inputClassName} min-w-[164px]`}
            >
              <option value="">
                {t("adminTournaments.filters.allFormats", "All Formats")}
              </option>
              <option value="swiss">{t("tournamentCommon.formats.swiss", "Swiss")}</option>
            </select>

            <select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value as "" | TournamentStatus);
                setPage(1);
              }}
              className={`${inputClassName} min-w-[164px]`}
            >
              <option value="">{t("adminTournaments.filters.allStatus", "All Status")}</option>
              <option value="DRAFT">{t("tournamentCommon.status.draft", "Draft")}</option>
              <option value="REGISTRATION_OPEN">
                {t("tournamentCommon.status.registrationOpen", "Registration Open")}
              </option>
              <option value="LIVE_ROUND">
                {t("tournamentCommon.status.liveRound", "Live Round")}
              </option>
              <option value="ROUND_CLOSED">
                {t("tournamentCommon.status.roundClosed", "Round Closed")}
              </option>
              <option value="FINISHED">
                {t("tournamentCommon.status.finished", "Finished")}
              </option>
            </select>

            <select
              value={sortMode}
              onChange={(event) => {
                setSortMode(event.target.value as typeof sortMode);
                setPage(1);
              }}
              className={`${inputClassName} min-w-[164px]`}
            >
              <option value="newest">
                {t("adminTournaments.sort.newest", "Newest")}
              </option>
              <option value="oldest">
                {t("adminTournaments.sort.oldest", "Oldest")}
              </option>
              <option value="most_players">
                {t("adminTournaments.sort.mostPlayers", "Most Players")}
              </option>
              <option value="live_first">
                {t("adminTournaments.sort.liveFirst", "Live First")}
              </option>
              <option value="name_az">
                {t("adminTournaments.sort.nameAZ", "Name A-Z")}
              </option>
            </select>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(420px,0.85fr)]">
          <section className={`${panelClassName} overflow-hidden`}>
            <div className="flex items-center justify-between border-b border-gray-200/80 px-5 py-5 dark:border-white/10">
              <div>
                <h2 className={sectionTitleClass}>
                  {t("adminTournaments.queue.title", "Tournament Queue")}
                </h2>
              </div>
              <span className="text-xs font-medium uppercase tracking-[0.18em] text-gray-500 dark:text-slate-400">
                {t("adminTournaments.queue.totalCount", {
                  count: pagination.total,
                  defaultValue: `${pagination.total} total`,
                })}
              </span>
            </div>

            {loadingList ? (
              <div className="flex items-center justify-center py-24">
                <Loader2 className="h-8 w-8 animate-spin text-[#a855f7]" />
              </div>
            ) : tournaments.length === 0 ? (
              <div className="py-20 text-center text-gray-500 dark:text-slate-400">
                <p>
                  {t(
                    "adminTournaments.queue.empty",
                    "No tournaments found with the current filters.",
                  )}
                </p>
              </div>
            ) : (
              <div className="overflow-hidden">
                <table className="w-full table-fixed">
                  <colgroup>
                    <col className="w-[24%]" />
                    <col className="w-[16%]" />
                    <col className="w-[24%]" />
                    <col className="w-[13%]" />
                    <col className="w-[8%]" />
                    <col className="w-[15%]" />
                  </colgroup>
                  <thead className="border-b border-gray-200/80 bg-gray-50/80 dark:border-white/10 dark:bg-slate-950/50">
                    <tr>
                      <th className={tableHeadingClass}>
                        {t("adminTournaments.table.event", "Event")}
                      </th>
                      <th className={tableHeadingClass}>
                        {t("adminTournaments.table.status", "Status")}
                      </th>
                      <th className={tableHeadingClass}>
                        {t("adminTournaments.table.organizer", "Organizer")}
                      </th>
                      <th className={tableHeadingClass}>
                        {t("adminTournaments.table.players", "Players")}
                      </th>
                      <th className={tableHeadingClass}>
                        {t("adminTournaments.table.round", "Round")}
                      </th>
                      <th className={`${tableHeadingClass} text-right`}>
                        {t("adminTournaments.table.actions", "Actions")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200/70 dark:divide-white/10">
                    {tournaments.map((tournament, index) => {
                      const isSelected = tournament.id === selectedId;
                      const canEdit = tournament.status === "DRAFT";
                      const canDelete = canDeleteTournamentStatus(tournament.status);

                      return (
                        <tr
                          key={tournament.id}
                          className={`cursor-pointer transition-colors ${
                            isSelected
                              ? "bg-[#a855f7]/10"
                              : index % 2 === 1
                                ? "bg-gray-50/50 dark:bg-slate-950/25"
                                : "bg-transparent"
                          } hover:bg-[#a855f7]/[0.06] dark:hover:bg-[#a855f7]/[0.08]`}
                          onClick={() => setSelectedId(tournament.id)}
                        >
                          <td className="px-3 py-3">
                            <div
                              className="line-clamp-2 font-medium leading-snug text-gray-900 dark:text-white"
                              title={tournament.name}
                            >
                              {tournament.name}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              <span
                                className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${typeBadgeClass(
                                  tournament.type,
                                )}`}
                              >
                                {formatTypeLabel(tournament.type)}
                              </span>
                              <span className="inline-flex items-center rounded-full border border-gray-200/80 bg-gray-50/70 px-2.5 py-1 text-xs font-medium text-gray-500 dark:border-white/10 dark:bg-slate-950/60 dark:text-slate-300">
                                {tournament.timeControlLabel}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <span
                              className={`inline-flex max-w-full items-center rounded-full px-2.5 py-1 text-xs font-semibold leading-tight ${statusBadgeClass(
                                tournament.status,
                              )}`}
                            >
                              {formatStatusLabel(tournament.status)}
                            </span>
                          </td>
                          <td className="min-w-0 px-3 py-3 text-sm">
                            <div className="truncate text-gray-900 dark:text-white">
                              {tournament.organizer?.fullName ||
                                t("tournamentCommon.generic.unknown", "Unknown")}
                            </div>
                            <div className="truncate text-gray-500 dark:text-slate-400">
                              {tournament.organizer?.email || "-"}
                            </div>
                          </td>
                          <td className="px-3 py-3 text-sm text-gray-700 dark:text-slate-200">
                            <div className="font-medium">
                              {t("adminTournaments.values.activeCount", {
                                count: tournament.activeCount,
                                defaultValue: `${tournament.activeCount} active`,
                              })}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-slate-400">
                              {t("adminTournaments.values.registeredCount", {
                                count: tournament.registeredCount,
                                defaultValue: `${tournament.registeredCount} registered`,
                              })}
                            </div>
                          </td>
                          <td className="px-3 py-3 text-sm font-medium text-gray-700 dark:text-slate-200">
                            {tournament.currentRound}/{tournament.roundsPlanned}
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setSelectedId(tournament.id);
                                }}
                                className="shrink-0 rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-[#a855f7]/10 hover:text-[#a855f7] dark:text-slate-400"
                                title={t("adminTournaments.table.inspect", "Inspect")}
                              >
                                <Eye className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                disabled={!canEdit}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  if (!canEdit) return;
                                  handleEditClick(tournament);
                                }}
                                className="shrink-0 rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-sky-500/10 hover:text-sky-500 disabled:cursor-not-allowed disabled:opacity-35 dark:text-slate-400"
                                title={
                                  canEdit
                                    ? t("adminTournaments.table.edit", "Edit")
                                    : t(
                                        "adminTournaments.table.onlyDraftsEditable",
                                        "Only drafts can be edited",
                                      )
                                }
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                disabled={!canDelete}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  if (!canDelete) return;
                                  handleDeleteClick(tournament);
                                }}
                                className="shrink-0 rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-red-500/10 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-35 dark:text-slate-400"
                                title={
                                  canDelete
                                    ? t("adminTournaments.table.delete", "Delete")
                                    : t(
                                        "adminTournaments.table.onlyPreLiveDeletable",
                                        "Only pre-live tournaments can be deleted",
                                      )
                                }
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {!loadingList && (
              <AdminPagination
                page={pagination.page}
                totalPages={pagination.pages}
                totalItems={pagination.total}
                pageSize={pagination.limit}
                itemLabel={t("adminTournaments.paginationItemLabel", "tournaments")}
                onPageChange={setPage}
              />
            )}
          </section>

          <section className={`${panelClassName} overflow-hidden`}>
            {!selectedSummary && !loadingDetail ? (
              <div className="flex h-full min-h-[480px] flex-col items-center justify-center px-6 text-center text-gray-500 dark:text-slate-400">
                <p className="font-medium text-gray-700 dark:text-slate-300">
                  {t(
                    "adminTournaments.detail.selectPrompt",
                    "Select a tournament to inspect the live admin controls.",
                  )}
                </p>
              </div>
            ) : loadingDetail && !detail ? (
              <div className="flex h-full min-h-[480px] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-[#a855f7]" />
              </div>
            ) : detail ? (
              <div className="flex flex-col">
                <div className="border-b border-gray-200/80 px-5 py-5 dark:border-white/10">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="break-words text-xl font-semibold text-gray-900 dark:text-white">
                          {detail.tournament.name}
                        </h2>
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(
                            detail.tournament.status,
                          )}`}
                        >
                          {formatStatusLabel(detail.tournament.status)}
                        </span>
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${typeBadgeClass(
                            detail.tournament.type,
                          )}`}
                        >
                          {formatTypeLabel(detail.tournament.type)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-gray-500 dark:text-slate-400">
                        {t("adminTournaments.detail.organizer", "Organizer")}:{" "}
                        <span className="text-gray-700 dark:text-slate-200">
                          {selectedSummary?.organizer?.fullName ||
                            detail.tournament.organizer?.username ||
                            t("tournamentCommon.generic.unknown", "Unknown")}
                        </span>
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className={labelClassName}>
                        {t("adminTournaments.detail.created", "Created")}
                      </div>
                      <div className="mt-2 text-sm text-gray-700 dark:text-slate-200">
                        {formatDateTime(detail.tournament.createdAt)}
                      </div>
                    </div>
                  </div>

                  {detail.tournament.description && (
                    <p className="mt-3 text-sm text-gray-600 dark:text-slate-300">
                      {detail.tournament.description}
                    </p>
                  )}

                  <div className="mt-5 overflow-hidden rounded-xl border border-gray-200/80 dark:border-white/10">
                    <div className="grid grid-cols-1 sm:grid-cols-2">
                      {detailInfoCards.map((card, index) => {
                        const hasBottomBorder = index < detailInfoCards.length - 2;
                        const hasRightBorder = index % 2 === 0;

                        return (
                          <div
                            key={card.key}
                            className={`min-w-0 bg-gray-50/70 p-4 dark:bg-slate-950/30 ${
                              hasBottomBorder
                                ? "border-b border-gray-200/80 dark:border-white/10"
                                : ""
                            } ${
                              hasRightBorder
                                ? "sm:border-r sm:border-gray-200/80 sm:dark:border-white/10"
                                : ""
                            }`}
                          >
                            <div className={labelClassName}>
                              {card.label}
                            </div>
                            <div className="mt-3 break-words text-2xl font-semibold text-gray-900 dark:text-white">
                              {card.value}
                            </div>
                            <div className="mt-1 break-words text-xs text-gray-500 dark:text-slate-400">
                              {card.meta}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {detailActions.map((action) => (
                      <button
                        key={action.id}
                        type="button"
                        onClick={() => void handleRunAction(action)}
                        disabled={busyAction === action.id}
                        className={`inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-60 ${
                          action.id === "next_round" || detailActions.length === 1
                            ? "sm:col-span-2"
                            : ""
                        } ${buttonToneClass(action.tone)}`}
                      >
                        {busyAction === action.id && (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        )}
                        {getDetailActionLabel(action.id)}
                      </button>
                    ))}

                    {detail.tournament.status === "DRAFT" && (
                      <button
                        type="button"
                        onClick={() => handleEditClick(selectedSummary || detail.tournament)}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200/80 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-white/10 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <Pencil className="h-4 w-4" />
                        {t("adminTournaments.actions.editDraft", "Edit Draft")}
                      </button>
                    )}

                    {canDeleteTournamentStatus(detail.tournament.status) && (
                      <button
                        type="button"
                        onClick={() =>
                          handleDeleteClick(selectedSummary || detail.tournament)
                        }
                        className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-red-400/40 bg-red-500/90 px-4 py-2.5 text-sm font-medium text-red-50 transition-colors hover:bg-red-400"
                      >
                        <Trash2 className="h-4 w-4" />
                        {t("adminTournaments.actions.deleteTournament", "Delete Tournament")}
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-4 p-5">
                  <div>
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className={labelClassName}>
                        {t("adminTournaments.standings.title", "Standings")}
                      </h3>
                      <span className="text-xs text-gray-500 dark:text-slate-400">
                        {formatStandingsMetaLabel(detail.standingsMeta.label)}
                      </span>
                    </div>
                    <div className="overflow-hidden rounded-xl border border-gray-200/80 dark:border-white/10">
                      <table className="w-full table-fixed text-left text-sm">
                        <colgroup>
                          <col className="w-[17%]" />
                          <col className="w-[35%]" />
                          <col className="w-[14%]" />
                          <col className="w-[22%]" />
                          <col className="w-[12%]" />
                        </colgroup>
                        <thead className="border-b border-gray-200/80 bg-gray-50/80 dark:border-white/10 dark:bg-slate-950/50">
                          <tr>
                            <th className="px-3 py-3 text-xs font-semibold uppercase tracking-[0.24em] text-gray-500 dark:text-slate-400">
                              {t("adminTournaments.standings.rank", "Rank")}
                            </th>
                            <th className="px-3 py-3 text-xs font-semibold uppercase tracking-[0.24em] text-gray-500 dark:text-slate-400">
                              {t("adminTournaments.standings.player", "Player")}
                            </th>
                            <th className="px-3 py-3 text-xs font-semibold uppercase tracking-[0.24em] text-gray-500 dark:text-slate-400">
                              {t("adminTournaments.standings.pointsShort", "Pts")}
                            </th>
                            <th className="px-3 py-3 text-xs font-semibold uppercase tracking-[0.24em] text-gray-500 dark:text-slate-400">
                              {t("adminTournaments.standings.record", "W-D-L")}
                            </th>
                            <th className="px-3 py-3 text-xs font-semibold uppercase tracking-[0.24em] text-gray-500 dark:text-slate-400">
                              {t("adminTournaments.standings.buchholzShort", "BH")}
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200/70 dark:divide-white/10">
                          {detail.standings.slice(0, 12).map((row, index) => (
                            <tr
                              key={row.userId}
                              className={
                                index % 2 === 1
                                  ? "bg-gray-50/50 dark:bg-slate-950/25"
                                  : "bg-transparent"
                              }
                            >
                              <td className="px-3 py-3 font-medium text-gray-900 dark:text-white">
                                {row.rank}
                              </td>
                              <td className="min-w-0 px-3 py-3">
                                <div className="truncate font-medium text-gray-900 dark:text-white">
                                  {row.username}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-slate-400">
                                  {t("adminTournaments.values.elo", {
                                    value: row.elo,
                                    defaultValue: `${row.elo} Elo`,
                                  })}
                                </div>
                              </td>
                              <td className="px-3 py-3 text-gray-700 dark:text-slate-200">
                                {row.points}
                              </td>
                              <td className="px-3 py-3 text-gray-700 dark:text-slate-200">
                                {row.wins}-{row.draws}-{row.losses}
                              </td>
                              <td className="px-3 py-3 text-gray-700 dark:text-slate-200">
                                {row.buchholz}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div>
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className={labelClassName}>
                        {t("adminTournaments.participants.title", "Participants")}
                      </h3>
                      <span className="text-xs text-gray-500 dark:text-slate-400">
                        {t("adminTournaments.participants.entries", {
                          count: detail.players.length,
                          defaultValue: `${detail.players.length} entries`,
                        })}
                      </span>
                    </div>
                    <div className="overflow-hidden rounded-xl border border-gray-200/80 dark:border-white/10">
                      {detail.players.slice(0, 12).map((player, index) => (
                        <div
                          key={player.id}
                          className={`flex items-center justify-between gap-3 border-t border-gray-200/80 px-4 py-3 first:border-t-0 dark:border-white/10 ${
                            index % 2 === 1 ? "bg-gray-50/50 dark:bg-slate-950/25" : ""
                          }`}
                        >
                          <div>
                            <div className="font-medium text-gray-900 dark:text-white">
                              {player.username}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-slate-400">
                              {t("adminTournaments.participants.seedElo", {
                                seed: player.seed ?? "-",
                                elo: player.elo,
                                defaultValue: `Seed ${player.seed ?? "-"} / ${player.elo} Elo`,
                              })}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-medium text-gray-900 dark:text-white">
                              {t("adminTournaments.values.points", {
                                count: player.score,
                                defaultValue: `${player.score} pts`,
                              })}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-slate-400">
                              {formatPlayerStatus(player.status)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {detail.winners.length > 0 && (
                    <div>
                      <div className="mb-3 flex items-center justify-between">
                        <h3 className={labelClassName}>
                          {t("adminTournaments.podium.title", "Podium")}
                        </h3>
                        <span className="text-xs text-gray-500 dark:text-slate-400">
                          {t("adminTournaments.podium.finalPlacements", "Final placements")}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        {detail.winners.slice(0, 3).map((winner) => (
                          <div
                            key={winner.userId}
                            className="rounded-xl border border-gray-200/80 bg-gray-50/70 p-4 dark:border-white/10 dark:bg-slate-950/30"
                          >
                            <div className={labelClassName}>
                              {t("adminTournaments.podium.place", {
                                place: winner.placement,
                                defaultValue: `Place ${winner.placement}`,
                              })}
                            </div>
                            <div className="mt-2 font-semibold text-gray-900 dark:text-white">
                              {winner.username}
                            </div>
                            <div className="mt-1 text-sm text-gray-500 dark:text-slate-400">
                              {t("adminTournaments.podium.scoreAndElo", {
                                score: winner.score,
                                delta: `${winner.eloDelta >= 0 ? "+" : ""}${winner.eloDelta}`,
                                defaultValue: `${winner.score} pts / ${winner.eloDelta >= 0 ? "+" : ""}${winner.eloDelta} Elo`,
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className={labelClassName}>
                        {t("adminTournaments.roundLedger.title", "Round Ledger")}
                      </h3>
                      <span className="text-xs text-gray-500 dark:text-slate-400">
                        {t("adminTournaments.roundLedger.recordedRounds", {
                          count: detail.rounds.length,
                          defaultValue: `${detail.rounds.length} recorded rounds`,
                        })}
                      </span>
                    </div>
                    <div className="space-y-3">
                      {detail.rounds.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-gray-300 px-4 py-6 text-sm text-gray-500 dark:border-gray-700 dark:text-slate-400">
                          {t(
                            "adminTournaments.roundLedger.empty",
                            "No rounds have been generated yet.",
                          )}
                        </div>
                      ) : (
                        detail.rounds.map((round) => (
                          <details
                            key={round.roundNumber}
                            className="overflow-hidden rounded-xl border border-gray-200/80 dark:border-white/10"
                          >
                            <summary className="flex list-none cursor-pointer items-center justify-between gap-3 bg-gray-50/80 px-4 py-3 dark:bg-slate-950/40">
                              <span className="font-medium text-gray-900 dark:text-white">
                                {t("adminTournaments.roundLedger.roundLabel", {
                                  round: round.roundNumber,
                                  defaultValue: `Round ${round.roundNumber}`,
                                })}
                              </span>
                              <span className="text-xs text-gray-500 dark:text-slate-400">
                                {t("adminTournaments.values.boardsCount", {
                                  count: round.games.length,
                                  defaultValue: `${round.games.length} boards`,
                                })}
                              </span>
                            </summary>
                            <div className="divide-y divide-gray-200/70 dark:divide-white/10">
                              {round.games.map((game) => (
                                <div
                                  key={game.id}
                                  className="flex items-center justify-between gap-3 px-4 py-3"
                                >
                                  <div>
                                    <div className="font-medium text-gray-900 dark:text-white">
                                      {t("adminTournaments.preview.boardMatch", {
                                        board: game.board,
                                        white: game.white,
                                        black:
                                          game.black ||
                                          t("tournamentCommon.generic.bye", "BYE"),
                                        defaultValue: `Board ${game.board}: ${game.white} vs ${
                                          game.black || t("tournamentCommon.generic.bye", "BYE")
                                        }`,
                                      })}
                                    </div>
                                    <div className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                                      {game.whiteRatingAtPairing}
                                      {game.blackRatingAtPairing !== null
                                        ? ` / ${game.blackRatingAtPairing}`
                                        : ""}{" / "}
                                      {game.isPublished
                                        ? t("adminTournaments.roundLedger.published", "Published")
                                        : t("adminTournaments.roundLedger.preview", "Preview")}
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                                      {game.result === "*"
                                        ? t(
                                            "tournamentCommon.result.inProgress",
                                            "In Progress",
                                          )
                                        : game.result}
                                    </div>
                                    <div className="text-xs text-gray-500 dark:text-slate-400">
                                      {game.status === "completed"
                                        ? t(
                                            "tournamentCommon.roundStatus.completed",
                                            "Completed",
                                          )
                                        : t(
                                            "tournamentCommon.roundStatus.inProgress",
                                            "In Progress",
                                          )}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </details>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        </div>
        </div>
      </main>

      <TournamentFormModal
        isOpen={showFormModal}
        onClose={() => {
          setShowFormModal(false);
          setEditingTournament(null);
        }}
        onSubmit={handleSubmitTournament}
        editingTournament={editingTournament}
        users={users}
        saving={saving}
      />

      {confirmDialog && (
        <div className="fixed inset-0 z-[75] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-gray-800 shadow-2xl p-5">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {t("adminTournaments.confirm.title", "Confirm Action")}
            </h3>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
              {confirmDialog.message}
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
              >
                {t("common.cancel", "Cancel")}
              </button>
              <button
                type="button"
                onClick={async () => {
                  const action = confirmDialog.onConfirm;
                  setConfirmDialog(null);
                  await action();
                }}
                className={`px-4 py-2 rounded-lg text-sm font-medium ${
                  confirmDialog.tone === "danger"
                    ? "bg-red-500 text-red-50 hover:bg-red-400"
                    : "bg-amber-500 text-amber-950 hover:bg-amber-400"
                }`}
              >
                {confirmDialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
