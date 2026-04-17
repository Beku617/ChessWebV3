import { useState, useEffect, useMemo } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Star,
  StarOff,
  Eye,
  EyeOff,
  Trophy,
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

export default function AdminFeaturedEvents() {
  const [events, setEvents] = useState<FeaturedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<FeaturedEvent | null>(null);
  const [formData, setFormData] = useState<FormState>(initialFormState);
  const [backgroundImageFile, setBackgroundImageFile] = useState<File | null>(
    null,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);

  const uploadBackgroundImage = async (eventId: string, file: File) => {
    const form = new FormData();
    form.append("backgroundImageFile", file);

    const response = await fetch(
      `${API_URL}/api/admin/featured-events/${eventId}/background-image`,
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
      const response = await fetch(`${API_URL}/api/admin/featured-events`, {
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

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const url = editingEvent
      ? `${API_URL}/api/admin/featured-events/${editingEvent._id}`
      : `${API_URL}/api/admin/featured-events`;

    const method = editingEvent ? "PUT" : "POST";
    const payload = {
      title: formData.title,
      description: formData.description,
      type: formData.type,
      status: formData.status,
      startDate: formData.startDate,
      featured: formData.featured,
      isActive: formData.isActive,
      primaryButtonLabel: formData.primaryButtonLabel || "Watch Now",
      primaryButtonUrl: formData.primaryButtonUrl,
      secondaryButtonUrl: formData.secondaryButtonUrl,
      backgroundType: formData.backgroundType,
      backgroundColor:
        formData.backgroundType === "color" ? formData.backgroundColor : "",
      backgroundImageUrl:
        formData.backgroundType === "image" ? formData.backgroundImageUrl : "",
      imageUrl:
        formData.backgroundType === "image" ? formData.backgroundImageUrl : "",
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
    }
  };

  // Handle delete
  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this event?")) return;

    try {
      await fetch(`${API_URL}/api/admin/featured-events/${id}`, {
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
        `${API_URL}/api/admin/featured-events/${id}/toggle-featured`,
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
      await fetch(`${API_URL}/api/admin/featured-events/${id}/toggle-active`, {
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
      await fetch(`${API_URL}/api/admin/featured-events/${id}/status`, {
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
    setShowModal(true);
  };

  // Open modal for editing
  const openEditModal = (event: FeaturedEvent) => {
    setEditingEvent(event);
    setFormData({
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
    setShowModal(true);
  };

  // Close modal
  const closeModal = () => {
    setShowModal(false);
    setEditingEvent(null);
    setFormData(initialFormState);
    setBackgroundImageFile(null);
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
      ? `${pBtnBase} w-9 h-9 bg-brand-500 text-white shadow-md shadow-brand-500/25`
      : `${pBtnBase} w-9 h-9 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300 hover:border-brand-400 dark:hover:border-brand-600 hover:text-brand-600 dark:hover:text-brand-400`;

  const getStatusColor = (status: string) => {
    switch (status) {
      case "live":
        return "bg-red-500";
      case "upcoming":
        return "bg-blue-500";
      case "completed":
        return "bg-gray-500";
      default:
        return "bg-gray-500";
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f5f7] dark:bg-gray-950 text-gray-900 dark:text-white flex">
      <AdminSidebar />

      <main className="flex-1 ml-72 p-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              Featured Events
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              Manage tournaments, matches, and events shown on the Watch page
            </p>
          </div>
          <button
            onClick={openNewModal}
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >
            <Plus className="w-5 h-5" />
            Add Event
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-4 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search events..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-gray-100 rounded-lg pl-10 pr-4 py-2 focus:outline-none focus:border-brand-500 shadow-sm"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-gray-100 rounded-lg px-4 py-2 focus:outline-none focus:border-brand-500 shadow-sm"
          >
            <option value="all">All Status</option>
            <option value="upcoming">Upcoming</option>
            <option value="live">Live</option>
            <option value="completed">Completed</option>
          </select>
        </div>

        {/* Events Table */}
        {loading ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            Loading...
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            <Trophy className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No events found</p>
            <button
              onClick={openNewModal}
              className="mt-4 text-brand-500 hover:underline"
            >
              Create your first event
            </button>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden shadow-sm">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-800/50">
                <tr>
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                    Event
                  </th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                    Type
                  </th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                    Status
                  </th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                    Date
                  </th>
                  <th className="text-center px-6 py-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                    Featured
                  </th>
                  <th className="text-center px-6 py-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                    Active
                  </th>
                  <th className="text-right px-6 py-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {paginatedEvents.map((event) => (
                  <tr
                    key={event._id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800/30"
                  >
                    <td className="px-6 py-4">
                      <div>
                        <div className="font-medium text-gray-900 dark:text-white">
                          {event.title}
                        </div>
                        {event.description && (
                          <div className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-xs">
                            {event.description}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="capitalize text-gray-600 dark:text-gray-300">
                        {event.type}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <select
                        value={event.status}
                        onChange={(e) =>
                          updateStatus(event._id, e.target.value)
                        }
                        className={`${getStatusColor(event.status)} text-white text-xs px-2 py-1 rounded font-medium bg-opacity-80`}
                      >
                        <option value="upcoming">Upcoming</option>
                        <option value="live">Live</option>
                        <option value="completed">Completed</option>
                      </select>
                    </td>
                    <td className="px-6 py-4 text-gray-500 dark:text-gray-400 text-sm">
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
                            : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400"
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
                            : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400"
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
                          className="p-2 text-gray-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-gray-800 rounded-lg transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(event._id)}
                          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-gray-800 rounded-lg transition-colors"
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
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-800">
              <div className="text-sm text-gray-500 dark:text-gray-400">
                {rangeStart}\u2013{rangeEnd} of {filteredEvents.length} events
              </div>
              {totalPages > 1 && (
                <div className="flex items-center gap-1.5">
                  <button
                    disabled={safePage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className={`${pBtnBase} w-9 h-9 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-500 dark:text-gray-400 hover:border-brand-400 dark:hover:border-brand-600 hover:text-brand-600 dark:hover:text-brand-400`}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  {pageNums.map((p, i) =>
                    p === "..." ? (
                      <span
                        key={`dots-${i}`}
                        className="w-9 h-9 flex items-center justify-center text-gray-400 dark:text-gray-600 text-sm select-none"
                      >
                        \u2026
                      </span>
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
                    className={`${pBtnBase} w-9 h-9 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-500 dark:text-gray-400 hover:border-brand-400 dark:hover:border-brand-600 hover:text-brand-600 dark:hover:text-brand-400`}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
              <div className="flex justify-between items-center p-6 border-b border-gray-200 dark:border-gray-800">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  {editingEvent ? "Edit Event" : "Add New Event"}
                </h2>
                <button
                  onClick={closeModal}
                  className="p-2 text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-6">
                {/* Title */}
                <div>
                  <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">
                    Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.title}
                    onChange={(e) =>
                      setFormData({ ...formData, title: e.target.value })
                    }
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-4 py-2 focus:outline-none focus:border-brand-500"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    rows={3}
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-4 py-2 focus:outline-none focus:border-brand-500"
                  />
                </div>

                {/* Type & Status */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">
                      Type
                    </label>
                    <select
                      value={formData.type}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          type: e.target.value as any,
                        })
                      }
                      className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-4 py-2 focus:outline-none focus:border-brand-500"
                    >
                      <option value="event">Event</option>
                      <option value="tournament">Tournament</option>
                      <option value="match">Match</option>
                      <option value="broadcast">Broadcast</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">
                      Status
                    </label>
                    <select
                      value={formData.status}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          status: e.target.value as any,
                        })
                      }
                      className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-4 py-2 focus:outline-none focus:border-brand-500"
                    >
                      <option value="upcoming">Upcoming</option>
                      <option value="live">Live</option>
                      <option value="completed">Completed</option>
                    </select>
                  </div>
                </div>

                {/* Dates */}
                <div>
                  <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">
                    Date
                  </label>
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={(e) =>
                      setFormData({ ...formData, startDate: e.target.value })
                    }
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-4 py-2 focus:outline-none focus:border-brand-500"
                  />
                </div>

                {/* Buttons */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">
                      Main Button Label
                    </label>
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
                      className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-4 py-2 focus:outline-none focus:border-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">
                      Main Button URL
                    </label>
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
                      className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-4 py-2 focus:outline-none focus:border-brand-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">
                      Secondary Button URL
                    </label>
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
                      className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-4 py-2 focus:outline-none focus:border-brand-500"
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
                        className="w-4 h-4 rounded border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-brand-500 focus:ring-brand-500"
                      />
                      <span className="text-sm text-gray-600 dark:text-gray-300">
                        Featured
                      </span>
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
                        className="w-4 h-4 rounded border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-brand-500 focus:ring-brand-500"
                      />
                      <span className="text-sm text-gray-600 dark:text-gray-300">
                        Active
                      </span>
                    </label>
                  </div>
                </div>

                {/* Background */}
                <div>
                  <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">
                    Background Type
                  </label>
                  <select
                    value={formData.backgroundType}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        backgroundType: e.target.value as BackgroundType,
                      })
                    }
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-4 py-2 focus:outline-none focus:border-brand-500"
                  >
                    <option value="default">Default Gradient</option>
                    <option value="color">Custom Color</option>
                    <option value="image">Custom Image</option>
                  </select>
                </div>

                {formData.backgroundType === "color" && (
                  <div>
                    <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">
                      Background Color
                    </label>
                    <input
                      type="color"
                      value={formData.backgroundColor || "#1a0e04"}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          backgroundColor: e.target.value,
                        })
                      }
                      className="h-10 w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-1.5 py-1 focus:outline-none focus:border-brand-500"
                    />
                  </div>
                )}

                {formData.backgroundType === "image" && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">
                        Background Image URL
                      </label>
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
                        className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-4 py-2 focus:outline-none focus:border-brand-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">
                        Upload Background Image
                      </label>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        onChange={(e) =>
                          setBackgroundImageFile(e.target.files?.[0] || null)
                        }
                        className="h-11 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-brand-500 file:mr-3 file:rounded-md file:border-0 file:bg-brand-600/20 file:px-2.5 file:py-1.5 file:text-xs file:font-semibold file:text-brand-200 hover:file:bg-brand-600/30 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                      />
                    </div>
                  </>
                )}

                {/* Actions */}
                <div className="flex justify-end gap-4 pt-4 border-t border-gray-200 dark:border-gray-800">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-4 py-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg font-medium transition-colors"
                  >
                    {editingEvent ? "Save Changes" : "Create Event"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

