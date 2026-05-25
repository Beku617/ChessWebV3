import { useState, useEffect, useMemo } from "react";
import { useTranslation, Trans } from "react-i18next";
import {
  Plus,
  Pencil,
  Trash2,
  Star,
  StarOff,
  Eye,
  EyeOff,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const EVENTS_PER_PAGE = 10;

function getPageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "...")[] = [1];
  const left = Math.max(2, current - 1);
  const right = Math.min(total - 1, current + 1);
  if (left > 2) pages.push("...");
  for (let i = left; i <= right; i++) pages.push(i);
  if (right < total - 1) pages.push("...");
  pages.push(total);
  return pages;
}
import AdminSidebar from "../../components/AdminSidebar";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

interface Player {
  name: string;
  rating: number;
  title?: string;
  country?: string;
}

interface FeaturedEvent {
  _id: string;
  pairId?: string;
  title: string;
  description?: string;
  type: "tournament" | "match" | "broadcast" | "event";
  lichessUrl?: string;
  imageUrl?: string;
  statusLabel?: string;
  categoryLabel?: string;
  viewerCountText?: string;
  primaryButtonLabel?: string;
  primaryButtonUrl?: string;
  secondaryButtonLabel?: string;
  secondaryButtonUrl?: string;
  backgroundType?: "default" | "color" | "image";
  backgroundColor?: string;
  backgroundImageUrl?: string;
  primaryButtonColor?: string;
  titleColor?: string;
  descriptionColor?: string;
  players?: Player[];
  startDate?: string;
  endDate?: string;
  status: "upcoming" | "live" | "completed";
  featured: boolean;
  priority: number;
  isActive: boolean;
  viewers: number;
  tags?: string[];
  createdAt: string;
}

type EventType = "tournament" | "match" | "broadcast" | "event";
type EventStatus = "upcoming" | "live" | "completed";
type BackgroundType = "default" | "color" | "image";

interface FormState {
  pairId: string;
  title: string;
  description: string;
  type: EventType;
  primaryButtonLabel: string;
  primaryButtonUrl: string;
  secondaryButtonUrl: string;
  backgroundType: BackgroundType;
  backgroundColor: string;
  backgroundImageUrl: string;
  startDate: string;
  status: EventStatus;
  featured: boolean;
  isActive: boolean;
}

const initialFormState: FormState = {
  pairId: "",
  title: "",
  description: "",
  type: "event",
  primaryButtonLabel: "Watch Now",
  primaryButtonUrl: "",
  secondaryButtonUrl: "",
  backgroundType: "default",
  backgroundColor: "#1a0e04",
  backgroundImageUrl: "",
  startDate: "",
  status: "upcoming",
  featured: false,
  isActive: true,
};

function generatePairId() {
  return String(Math.floor(Math.random() * 90000) + 10000);
}

export default function AdminEventsMn() {
  const { t } = useTranslation();
  const [events, setEvents] = useState<FeaturedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<FeaturedEvent | null>(null);
  const [formData, setFormData] = useState<FormState>(initialFormState);
  const [backgroundImageFile, setBackgroundImageFile] = useState<File | null>(
    null,
  );
  const [saveError, setSaveError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importSaving, setImportSaving] = useState(false);
  const [importSourceEvents, setImportSourceEvents] = useState<FeaturedEvent[]>([]);
  const [selectedImportEventIds, setSelectedImportEventIds] = useState<string[]>(
    [],
  );
  const [importError, setImportError] = useState("");
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [importToast, setImportToast] = useState("");

  const uploadBackgroundImage = async (eventId: string, file: File) => {
    const form = new FormData();
    form.append("backgroundImageFile", file);

    const response = await fetch(
      `${API_URL}/api/admin/events-mn/${eventId}/background-image`,
      {
        method: "POST",
        credentials: "include",
        body: form,
      },
    );

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "Failed to upload background image.");
    }
  };

  // Fetch events
  const fetchEvents = async () => {
    try {
      const response = await fetch(`${API_URL}/api/admin/events-mn`, {
        credentials: "include",
      });
      const data = await response.json();
      setEvents(data.events || []);
    } catch (error) {
      console.error("Error fetching events:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  useEffect(() => {
    if (!importToast) return undefined;
    const timer = setTimeout(() => setImportToast(""), 3400);
    return () => clearTimeout(timer);
  }, [importToast]);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      setSaveError("Title is required.");
      return;
    }
    setSaveError("");

    const url = editingEvent
      ? `${API_URL}/api/admin/events-mn/${editingEvent._id}`
      : `${API_URL}/api/admin/events-mn`;

    const method = editingEvent ? "PUT" : "POST";
    const payload = {
      pairId: formData.pairId.trim(),
      title: formData.title.trim(),
      description: formData.description.trim(),
      type: formData.type,
      status: formData.status,
      startDate: formData.startDate,
      featured: formData.featured,
      isActive: formData.isActive,
      primaryButtonLabel: formData.primaryButtonLabel.trim() || "Watch Now",
      primaryButtonUrl: formData.primaryButtonUrl.trim(),
      secondaryButtonUrl: formData.secondaryButtonUrl.trim(),
      backgroundType: formData.backgroundType,
      backgroundColor:
        formData.backgroundType === "color" ? formData.backgroundColor.trim() : "",
      backgroundImageUrl:
        formData.backgroundType === "image"
          ? formData.backgroundImageUrl.trim()
          : "",
      imageUrl:
        formData.backgroundType === "image"
          ? formData.backgroundImageUrl.trim()
          : "",
      // Keep removed advanced fields blanked for a cleaner admin/user flow.
      statusLabel: "",
      categoryLabel: "",
      viewerCountText: "",
      secondaryButtonLabel: "",
      primaryButtonColor: "",
      titleColor: "",
      descriptionColor: "",
    };

    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Failed to save event.");
      }

      const savedEventId = String(
        data?._id || editingEvent?._id || "",
      ).trim();
      if (backgroundImageFile && savedEventId) {
        await uploadBackgroundImage(savedEventId, backgroundImageFile);
      }

      await fetchEvents();
      closeModal();
    } catch (error) {
      console.error("Error saving event:", error);
      setSaveError(
        error instanceof Error ? error.message : "Failed to save event.",
      );
    }
  };

  // Handle delete
  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this event?")) return;

    try {
      await fetch(`${API_URL}/api/admin/events-mn/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      fetchEvents();
    } catch (error) {
      console.error("Error deleting event:", error);
    }
  };

  // Toggle featured
  const toggleFeatured = async (id: string) => {
    try {
      await fetch(
        `${API_URL}/api/admin/events-mn/${id}/toggle-featured`,
        {
          method: "PATCH",
          credentials: "include",
        },
      );
      fetchEvents();
    } catch (error) {
      console.error("Error toggling featured:", error);
    }
  };

  // Toggle active
  const toggleActive = async (id: string) => {
    try {
      await fetch(`${API_URL}/api/admin/events-mn/${id}/toggle-active`, {
        method: "PATCH",
        credentials: "include",
      });
      fetchEvents();
    } catch (error) {
      console.error("Error toggling active:", error);
    }
  };

  // Update status
  const updateStatus = async (id: string, status: string) => {
    try {
      await fetch(`${API_URL}/api/admin/events-mn/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      fetchEvents();
    } catch (error) {
      console.error("Error updating status:", error);
    }
  };

  // Open modal for new event
  const openNewModal = () => {
    setEditingEvent(null);
    setFormData(initialFormState);
    setBackgroundImageFile(null);
    setSaveError("");
    setShowModal(true);
  };

  // Open modal for editing
  const openEditModal = (event: FeaturedEvent) => {
    setEditingEvent(event);
    setFormData({
      pairId: event.pairId || "",
      title: event.title,
      description: event.description || "",
      type: event.type,
      primaryButtonLabel: event.primaryButtonLabel || "Watch Now",
      primaryButtonUrl:
        event.primaryButtonUrl || event.lichessUrl || event.secondaryButtonUrl || "",
      secondaryButtonUrl: event.secondaryButtonUrl || "",
      backgroundType:
        event.backgroundType ||
        (event.backgroundImageUrl || event.imageUrl
          ? "image"
          : event.backgroundColor
            ? "color"
            : "default"),
      backgroundColor: event.backgroundColor || "#1a0e04",
      backgroundImageUrl: event.backgroundImageUrl || event.imageUrl || "",
      startDate: event.startDate ? event.startDate.split("T")[0] : "",
      status: event.status,
      featured: event.featured,
      isActive: event.isActive,
    });
    setBackgroundImageFile(null);
    setSaveError("");
    setShowModal(true);
  };

  // Close modal
  const closeModal = () => {
    setShowModal(false);
    setEditingEvent(null);
    setFormData(initialFormState);
    setBackgroundImageFile(null);
    setSaveError("");
  };

  const handleOpenImportModal = async () => {
    setImportModalOpen(true);
    setImportLoading(true);
    setImportError("");
    setImportWarnings([]);
    setSelectedImportEventIds([]);
    try {
      const response = await fetch(`${API_URL}/api/admin/featured-events`, {
        credentials: "include",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Failed to load English events.");
      }
      setImportSourceEvents(Array.isArray(data.events) ? data.events : []);
    } catch (error) {
      setImportError(
        error instanceof Error
          ? error.message
          : "Failed to load source events for import.",
      );
      setImportSourceEvents([]);
    } finally {
      setImportLoading(false);
    }
  };

  const closeImportModal = () => {
    setImportModalOpen(false);
    setImportError("");
    setSelectedImportEventIds([]);
  };

  const allImportSelected =
    importSourceEvents.length > 0 &&
    selectedImportEventIds.length === importSourceEvents.length;

  const toggleSelectImportEvent = (eventId: string) => {
    setSelectedImportEventIds((current) =>
      current.includes(eventId)
        ? current.filter((entry) => entry !== eventId)
        : [...current, eventId],
    );
  };

  const toggleSelectAllImportEvents = () => {
    setSelectedImportEventIds((current) =>
      current.length === importSourceEvents.length
        ? []
        : importSourceEvents.map((event) => event._id),
    );
  };

  const handleImportSelected = async () => {
    if (!selectedImportEventIds.length) return;
    setImportSaving(true);
    setImportError("");
    try {
      const response = await fetch(`${API_URL}/api/admin/events-mn/import-from-en`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ eventIds: selectedImportEventIds }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Failed to import events.");
      }
      await fetchEvents();
      setImportWarnings(Array.isArray(data.warnings) ? data.warnings : []);
      setImportToast(`${Number(data.importedCount) || 0} event(s) imported successfully`);
      closeImportModal();
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setImportSaving(false);
    }
  };

  // Filter events
  const filteredEvents = events.filter((event) => {
    const matchesSearch =
      event.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      event.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus =
      filterStatus === "all" || event.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterStatus]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredEvents.length / EVENTS_PER_PAGE),
  );
  const safePage = Math.min(currentPage, totalPages);

  const paginatedEvents = useMemo(() => {
    const start = (safePage - 1) * EVENTS_PER_PAGE;
    return filteredEvents.slice(start, start + EVENTS_PER_PAGE);
  }, [filteredEvents, safePage]);

  const pageNums = getPageNumbers(safePage, totalPages);
  const rangeStart =
    filteredEvents.length === 0 ? 0 : (safePage - 1) * EVENTS_PER_PAGE + 1;
  const rangeEnd = Math.min(safePage * EVENTS_PER_PAGE, filteredEvents.length);

  const pBtnBase =
    "inline-flex items-center justify-center rounded-lg text-sm font-medium transition-colors focus:outline-none disabled:pointer-events-none disabled:opacity-40";
  const pBtnPage = (active: boolean) =>
    active
      ? `${pBtnBase} w-9 h-9 bg-brand-500 text-theme-on-accent shadow-md shadow-brand-500/25`
      : `${pBtnBase} w-9 h-9 bg-theme-panel border border-theme-glass text-theme-muted hover:border-brand-400 hover:text-brand-600`;

  const getStatusColor = (status: string) => {
    switch (status) {
      case "live":
        return "bg-red-500";
      case "upcoming":
        return "bg-blue-500";
      case "completed":
        return "bg-theme-surface";
      default:
        return "bg-theme-surface";
    }
  };

  return (
    <div className="min-h-screen bg-theme-panel text-theme-foreground flex">
      <AdminSidebar />

      <main className="flex-1 ml-72 p-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-theme-foreground "> <Trans>Featured Events</Trans> </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => void handleOpenImportModal()}
              className="rounded-lg border border-theme-glass bg-theme-panel px-4 py-2 font-medium text-theme-muted transition-colors hover:bg-theme-surface"
            > <Trans>Import from EN</Trans> </button>
            <button
              onClick={openNewModal}
              className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-theme-on-accent px-4 py-2 rounded-lg font-medium transition-colors"
            >
              <Plus className="w-5 h-5" /> <Trans>Add Event</Trans> </button>
          </div>
        </div>

        {importWarnings.length > 0 && (
          <div className="mb-5 rounded-lg border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-700">
            {importWarnings.join(" | ")}
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-4 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-muted" />
            <input
              type="text"
              placeholder={t("admin.search.events")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-theme-panel border border-theme-glass text-theme-foreground rounded-lg pl-10 pr-4 py-2 focus:outline-none focus:border-brand-500 shadow-sm"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-theme-panel border border-theme-glass text-theme-foreground rounded-lg px-4 py-2 focus:outline-none focus:border-brand-500 shadow-sm"
          >
            <option value="all"><Trans>All Status</Trans></option>
            <option value="upcoming"><Trans>Upcoming</Trans></option>
            <option value="live"><Trans>Live</Trans></option>
            <option value="completed"><Trans>Completed</Trans></option>
          </select>
        </div>

        {/* Events Table */}
        {loading ? (
          <div className="text-center py-12 text-theme-muted">
            Loading...
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="text-center py-12 text-theme-muted">
            <p><Trans>No events found</Trans></p>
            <button
              onClick={openNewModal}
              className="mt-4 text-brand-500 hover:underline"
            > <Trans>Create your first event</Trans> </button>
          </div>
        ) : (
          <div className="bg-theme-panel border border-theme-glass rounded-xl overflow-hidden shadow-sm">
            <table className="w-full">
              <thead className="bg-theme-surface">
                <tr>
                  <th className="text-left px-6 py-4 text-sm font-medium text-theme-muted"> <Trans>Event</Trans> </th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-theme-muted"> <Trans>Type</Trans> </th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-theme-muted"> <Trans>Status</Trans> </th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-theme-muted"> <Trans>Date</Trans> </th>
                  <th className="text-center px-6 py-4 text-sm font-medium text-theme-muted"> <Trans>Featured</Trans> </th>
                  <th className="text-center px-6 py-4 text-sm font-medium text-theme-muted"> <Trans>Active</Trans> </th>
                  <th className="text-right px-6 py-4 text-sm font-medium text-theme-muted"> <Trans>Actions</Trans> </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-theme-glass">
                {paginatedEvents.map((event) => (
                  <tr
                    key={event._id}
                    className="hover:bg-theme-surface"
                  >
                    <td className="px-6 py-4">
                      <div>
                        <div className="font-medium text-theme-foreground ">
                          {event.title}
                        </div>
                        {event.pairId && (
                          <div className="mt-1 inline-flex rounded-full bg-theme-surface px-2 py-0.5 text-[10px] font-medium text-theme-muted"> <Trans>Pair ID:</Trans> {event.pairId}
                          </div>
                        )}
                        {event.description && (
                          <div className="text-sm text-theme-muted truncate max-w-xs">
                            {event.description}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="capitalize text-theme-muted">
                        {event.type}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <select
                        value={event.status}
                        onChange={(e) =>
                          updateStatus(event._id, e.target.value)
                        }
                        className={`${getStatusColor(event.status)} text-theme-on-accent text-xs px-2 py-1 rounded font-medium bg-opacity-80`}
                      >
                        <option value="upcoming"><Trans>Upcoming</Trans></option>
                        <option value="live"><Trans>Live</Trans></option>
                        <option value="completed"><Trans>Completed</Trans></option>
                      </select>
                    </td>
                    <td className="px-6 py-4 text-theme-muted text-sm">
                      {event.startDate
                        ? new Date(event.startDate).toLocaleDateString()
                        : "-"}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => toggleFeatured(event._id)}
                        className={`p-1 rounded transition-colors ${
                          event.featured
                            ? "text-yellow-500 hover:text-yellow-400"
                            : "text-theme-muted hover:text-theme-muted"
                        }`}
                      >
                        {event.featured ? (
                          <Star className="w-5 h-5 fill-current" />
                        ) : (
                          <StarOff className="w-5 h-5" />
                        )}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => toggleActive(event._id)}
                        className={`p-1 rounded transition-colors ${
                          event.isActive
                            ? "text-green-500 hover:text-green-400"
                            : "text-theme-muted hover:text-theme-muted"
                        }`}
                      >
                        {event.isActive ? (
                          <Eye className="w-5 h-5" />
                        ) : (
                          <EyeOff className="w-5 h-5" />
                        )}
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => openEditModal(event)}
                          className="p-2 text-theme-muted hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(event._id)}
                          className="p-2 text-theme-muted hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-theme-glass ">
              <div className="text-sm text-theme-muted">
                {rangeStart}<Trans>\u2013</Trans>{rangeEnd} <Trans>of</Trans> {filteredEvents.length} <Trans>events</Trans> </div>
              {totalPages > 1 && (
                <div className="flex items-center gap-1.5">
                  <button
                    disabled={safePage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className={`${pBtnBase} w-9 h-9 bg-theme-panel border border-theme-glass text-theme-muted hover:border-brand-400 hover:text-brand-600`}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  {pageNums.map((p, i) =>
                    p === "..." ? (
                      <span
                        key={`dots-${i}`}
                        className="w-9 h-9 flex items-center justify-center text-theme-muted text-sm select-none"
                      > <Trans>\u2026</Trans> </span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => setCurrentPage(p)}
                        className={pBtnPage(p === safePage)}
                      >
                        {p}
                      </button>
                    ),
                  )}
                  <button
                    disabled={safePage >= totalPages}
                    onClick={() =>
                      setCurrentPage((p) => Math.min(totalPages, p + 1))
                    }
                    className={`${pBtnBase} w-9 h-9 bg-theme-panel border border-theme-glass text-theme-muted hover:border-brand-400 hover:text-brand-600`}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {importModalOpen && (
          <div className="fixed inset-0 bg-theme-panel/50 flex items-center justify-center z-[55] p-4">
            <div className="bg-theme-panel border border-theme-glass rounded-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-xl">
              <div className="flex justify-between items-center p-6 border-b border-theme-glass ">
                <h2 className="text-xl font-bold text-theme-foreground "> <Trans>Import from EN</Trans> </h2>
                <button
                  onClick={closeImportModal}
                  disabled={importSaving}
                  className="px-3 py-1.5 text-sm text-theme-muted hover:text-theme-foreground disabled:opacity-60"
                > <Trans>Close</Trans> </button>
              </div>

              <div className="p-6">
                {importError && (
                  <div className="mb-4 rounded-lg border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-700">
                    {importError}
                  </div>
                )}

                <div className="rounded-xl border border-theme-glass overflow-hidden">
                  {importLoading ? (
                    <div className="py-16 text-center text-theme-muted">
                      Loading...
                    </div>
                  ) : importSourceEvents.length === 0 ? (
                    <div className="py-12 text-center text-sm text-theme-muted"> <Trans>No events available to import.</Trans> </div>
                  ) : (
                    <div className="max-h-[52vh] overflow-auto">
                      <table className="w-full min-w-[860px]">
                        <thead className="bg-theme-surface">
                          <tr>
                            <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-theme-muted">
                              <label className="inline-flex items-center gap-2 text-xs font-medium normal-case tracking-normal text-theme-muted">
                                <input
                                  type="checkbox"
                                  checked={allImportSelected}
                                  onChange={toggleSelectAllImportEvents}
                                  className="h-4 w-4 rounded border-theme-glass "
                                /> <Trans>All</Trans> </label>
                            </th>
                            <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-theme-muted"> <Trans>Event</Trans> </th>
                            <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-theme-muted"> <Trans>Type</Trans> </th>
                            <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-theme-muted"> <Trans>Status</Trans> </th>
                            <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-theme-muted"> <Trans>Pair ID</Trans> </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-theme-glass">
                          {importSourceEvents.map((event) => (
                            <tr key={event._id}>
                              <td className="px-4 py-3">
                                <input
                                  type="checkbox"
                                  checked={selectedImportEventIds.includes(event._id)}
                                  onChange={() => toggleSelectImportEvent(event._id)}
                                  className="h-4 w-4 rounded border-theme-glass "
                                />
                              </td>
                              <td className="px-4 py-3 text-sm font-medium text-theme-foreground ">
                                {event.title}
                              </td>
                              <td className="px-4 py-3 text-sm text-theme-muted capitalize">
                                {event.type}
                              </td>
                              <td className="px-4 py-3 text-sm text-theme-muted capitalize">
                                {event.status}
                              </td>
                              <td className="px-4 py-3 text-sm text-theme-muted">
                                {event.pairId || "-"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="mt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={closeImportModal}
                    disabled={importSaving}
                    className="px-4 py-2 text-theme-muted hover:text-theme-foreground transition-colors disabled:opacity-60"
                  > <Trans>Cancel</Trans> </button>
                  <button
                    type="button"
                    onClick={() => void handleImportSelected()}
                    disabled={importSaving || selectedImportEventIds.length === 0}
                    className="px-5 py-2 bg-brand-600 hover:bg-brand-500 text-theme-on-accent rounded-lg font-medium transition-colors disabled:opacity-60"
                  > <Trans>Import Selected</Trans> </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-theme-panel/50 flex items-center justify-center z-50 p-4">
            <div className="bg-theme-panel border border-theme-glass rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
              <div className="flex justify-between items-center p-6 border-b border-theme-glass ">
                <h2 className="text-xl font-bold text-theme-foreground ">
                  {editingEvent
                    ? t("admin.modal.editEvent")
                    : t("admin.modal.addNewEvent")}
                </h2>
                <button
                  onClick={closeModal}
                  className="p-2 text-theme-muted hover:text-theme-foreground hover:bg-theme-surface rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-6">
                {saveError && (
                  <div className="rounded-lg border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-700">
                    {saveError}
                  </div>
                )}
                {/* Title */}
                <div>
                  <label className="block text-sm font-medium text-theme-muted mb-2"> <Trans>Title *</Trans> </label>
                  <input
                    type="text"
                    required
                    value={formData.title}
                    onChange={(e) =>
                      setFormData({ ...formData, title: e.target.value })
                    }
                    className="w-full bg-theme-surface border border-theme-glass text-theme-foreground rounded-lg px-4 py-2 focus:outline-none focus:border-brand-500"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-theme-muted mb-2"> <Trans>Description</Trans> </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    rows={3}
                    className="w-full bg-theme-surface border border-theme-glass text-theme-foreground rounded-lg px-4 py-2 focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-theme-muted mb-2"> <Trans>Pair ID</Trans> </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]{5}"
                      maxLength={5}
                      value={formData.pairId}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          pairId: e.target.value.replace(/\D/g, "").slice(0, 5),
                        })
                      }
                      placeholder="10423"
                      className="w-full bg-theme-surface border border-theme-glass text-theme-foreground rounded-lg px-4 py-2 focus:outline-none focus:border-brand-500"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setFormData({ ...formData, pairId: generatePairId() })
                      }
                      className="rounded-lg border border-theme-glass bg-theme-surface px-3 py-2 text-sm font-medium text-theme-muted hover:bg-theme-surface/80 "
                    > <Trans>Generate</Trans> </button>
                  </div>
                </div>

                {/* Type & Status */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-theme-muted mb-2"> <Trans>Type</Trans> </label>
                    <select
                      value={formData.type}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          type: e.target.value as any,
                        })
                      }
                      className="w-full bg-theme-surface border border-theme-glass text-theme-foreground rounded-lg px-4 py-2 focus:outline-none focus:border-brand-500"
                    >
                      <option value="event"><Trans>Event</Trans></option>
                      <option value="tournament"><Trans>Tournament</Trans></option>
                      <option value="match"><Trans>Match</Trans></option>
                      <option value="broadcast"><Trans>Broadcast</Trans></option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-theme-muted mb-2"> <Trans>Status</Trans> </label>
                    <select
                      value={formData.status}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          status: e.target.value as any,
                        })
                      }
                      className="w-full bg-theme-surface border border-theme-glass text-theme-foreground rounded-lg px-4 py-2 focus:outline-none focus:border-brand-500"
                    >
                      <option value="upcoming"><Trans>Upcoming</Trans></option>
                      <option value="live"><Trans>Live</Trans></option>
                      <option value="completed"><Trans>Completed</Trans></option>
                    </select>
                  </div>
                </div>

                {/* Dates */}
                <div>
                  <label className="block text-sm font-medium text-theme-muted mb-2"> <Trans>Date</Trans> </label>
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={(e) =>
                      setFormData({ ...formData, startDate: e.target.value })
                    }
                    className="w-full bg-theme-surface border border-theme-glass text-theme-foreground rounded-lg px-4 py-2 focus:outline-none focus:border-brand-500"
                  />
                </div>

                {/* Buttons */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-theme-muted mb-2"> <Trans>Main Button Label</Trans> </label>
                    <input
                      type="text"
                      value={formData.primaryButtonLabel}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          primaryButtonLabel: e.target.value,
                        })
                      }
                      placeholder="Watch Now"
                      className="w-full bg-theme-surface border border-theme-glass text-theme-foreground rounded-lg px-4 py-2 focus:outline-none focus:border-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-theme-muted mb-2"> <Trans>Main Button URL</Trans> </label>
                    <input
                      type="url"
                      value={formData.primaryButtonUrl}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          primaryButtonUrl: e.target.value,
                        })
                      }
                      placeholder="https://..."
                      className="w-full bg-theme-surface border border-theme-glass text-theme-foreground rounded-lg px-4 py-2 focus:outline-none focus:border-brand-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-theme-muted mb-2"> <Trans>Secondary Button URL</Trans> </label>
                    <input
                      type="url"
                      value={formData.secondaryButtonUrl}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          secondaryButtonUrl: e.target.value,
                        })
                      }
                      placeholder="https://..."
                      className="w-full bg-theme-surface border border-theme-glass text-theme-foreground rounded-lg px-4 py-2 focus:outline-none focus:border-brand-500"
                    />
                  </div>
                  <div className="flex items-end gap-6">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.featured}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            featured: e.target.checked,
                          })
                        }
                        className="w-4 h-4 rounded border-theme-glass bg-theme-surface text-brand-500 focus:ring-brand-500"
                      />
                      <span className="text-sm text-theme-muted"> <Trans>Featured</Trans> </span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.isActive}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            isActive: e.target.checked,
                          })
                        }
                        className="w-4 h-4 rounded border-theme-glass bg-theme-surface text-brand-500 focus:ring-brand-500"
                      />
                      <span className="text-sm text-theme-muted"> <Trans>Active</Trans> </span>
                    </label>
                  </div>
                </div>

                {/* Background */}
                <div>
                  <label className="block text-sm font-medium text-theme-muted mb-2"> <Trans>Background Type</Trans> </label>
                  <select
                    value={formData.backgroundType}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        backgroundType: e.target.value as BackgroundType,
                      })
                    }
                    className="w-full bg-theme-surface border border-theme-glass text-theme-foreground rounded-lg px-4 py-2 focus:outline-none focus:border-brand-500"
                  >
                    <option value="default"><Trans>Default Gradient</Trans></option>
                    <option value="color"><Trans>Custom Color</Trans></option>
                    <option value="image"><Trans>Custom Image</Trans></option>
                  </select>
                </div>

                {formData.backgroundType === "color" && (
                  <div>
                    <label className="block text-sm font-medium text-theme-muted mb-2"> <Trans>Background Color</Trans> </label>
                    <input
                      type="color"
                      value={formData.backgroundColor || "#1a0e04"}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          backgroundColor: e.target.value,
                        })
                      }
                      className="h-10 w-full bg-theme-surface border border-theme-glass rounded-lg px-1.5 py-1 focus:outline-none focus:border-brand-500"
                    />
                  </div>
                )}

                {formData.backgroundType === "image" && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-theme-muted mb-2"> <Trans>Background Image URL</Trans> </label>
                      <input
                        type="url"
                        value={formData.backgroundImageUrl}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            backgroundImageUrl: e.target.value,
                          })
                        }
                        placeholder="https://..."
                        className="w-full bg-theme-surface border border-theme-glass text-theme-foreground rounded-lg px-4 py-2 focus:outline-none focus:border-brand-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-theme-muted mb-2"> <Trans>Upload Background Image</Trans> </label>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        onChange={(e) =>
                          setBackgroundImageFile(e.target.files?.[0] || null)
                        }
                        className="h-11 w-full rounded-lg border border-theme-glass bg-theme-surface px-3 py-2 text-sm text-theme-foreground focus:outline-none focus:border-brand-500 file:mr-3 file:rounded-md file:border-0 file:bg-brand-600/20 file:px-2.5 file:py-1.5 file:text-xs file:font-semibold file:text-brand-200 hover:file:bg-brand-600/30 "
                      />
                    </div>
                  </>
                )}

                {/* Actions */}
                <div className="flex justify-end gap-4 pt-4 border-t border-theme-glass ">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-4 py-2 text-theme-muted hover:text-theme-foreground transition-colors"
                  > <Trans>Cancel</Trans> </button>
                  <button
                    type="submit"
                    className="px-6 py-2 bg-brand-600 hover:bg-brand-500 text-theme-on-accent rounded-lg font-medium transition-colors"
                  >
                    {editingEvent
                      ? t("admin.modal.saveChanges")
                      : t("admin.modal.createEvent")}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {importToast && (
          <div className="pointer-events-none fixed bottom-6 right-6 z-[70] rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-theme-on-accent shadow-lg">
            {importToast}
          </div>
        )}
      </main>
    </div>
  );
}


