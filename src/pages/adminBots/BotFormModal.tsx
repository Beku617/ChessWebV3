import { useState, useRef, useEffect } from "react";
import { X, Upload, Image as ImageIcon } from "lucide-react";
import type { BotFormData, BotData } from "./types";
import {
  DIFFICULTY_OPTIONS,
  PLAY_STYLE_OPTIONS,
  DEFAULT_BOT_FORM,
} from "./types";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

interface BotFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: BotFormData) => Promise<void>;
  editingBot: BotData | null;
  saving: boolean;
}

const EMOJI_AVATARS = [
  "🤖",
  "🧒",
  "👴",
  "👧",
  "🧑",
  "👩",
  "🧔",
  "👩‍🦰",
  "🧑‍🦱",
  "👨‍💼",
  "🧕",
  "🧔‍♂️",
  "👩‍🎓",
  "🧑‍💻",
  "👸",
  "🎭",
  "🥷",
  "🎩",
  "👩‍⚖️",
  "🦁",
  "👑",
  "🎯",
  "⚔️",
  "🏆",
];

export function BotFormModal({
  isOpen,
  onClose,
  onSubmit,
  editingBot,
  saving,
}: BotFormModalProps) {
  const [formData, setFormData] = useState<BotFormData>(DEFAULT_BOT_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingBot) {
      setFormData({
        name: editingBot.name,
        avatar: editingBot.avatar,
        avatarFile: null,
        eloRating: editingBot.eloRating,
        difficulty: editingBot.difficulty,
        category: editingBot.category,
        title: editingBot.title,
        quote: editingBot.quote,
        description: editingBot.description,
        personality: editingBot.personality,
        countryCode: editingBot.countryCode,
        playStyle: editingBot.playStyle,
        skillLevel: editingBot.skillLevel,
        depth: editingBot.depth,
        thinkTimeMs: editingBot.thinkTimeMs,
        blunderChance: editingBot.blunderChance,
        aggressiveness: editingBot.aggressiveness,
        openingBook: editingBot.openingBook,
        isActive: editingBot.isActive,
        sortOrder: editingBot.sortOrder,
      });
      if (editingBot.avatarUrl) {
        setPreviewUrl(`${API_URL}${editingBot.avatarUrl}`);
      }
    } else {
      setFormData(DEFAULT_BOT_FORM);
      setPreviewUrl("");
    }
    setErrors({});
  }, [editingBot, isOpen]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name || formData.name.length < 2) {
      newErrors.name = "Name must be at least 2 characters";
    } else if (formData.name.length > 50) {
      newErrors.name = "Name must be less than 50 characters";
    }

    if (formData.eloRating < 100 || formData.eloRating > 3000) {
      newErrors.eloRating = "ELO must be between 100-3000";
    }

    if (formData.quote && formData.quote.length > 200) {
      newErrors.quote = "Quote must be less than 200 characters";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    await onSubmit(formData);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setErrors({ ...errors, avatarFile: "File size must be less than 5MB" });
        return;
      }
      setFormData({ ...formData, avatarFile: file });
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            {editingBot ? "Edit Bot" : "Create New Bot"}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left Column */}
            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Bot Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className={`w-full px-4 py-2 rounded-lg border ${errors.name ? "border-red-500" : "border-gray-300 dark:border-gray-600"} bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-500 focus:border-transparent`}
                  placeholder="Enter bot name"
                />
                {errors.name && (
                  <p className="text-red-500 text-xs mt-1">{errors.name}</p>
                )}
              </div>

              {/* Avatar Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Avatar Emoji
                </label>
                <div className="flex flex-wrap gap-2 p-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-slate-800">
                  {EMOJI_AVATARS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() =>
                        setFormData({ ...formData, avatar: emoji })
                      }
                      className={`w-10 h-10 text-xl rounded-lg flex items-center justify-center transition-all ${
                        formData.avatar === emoji
                          ? "bg-brand-500 ring-2 ring-brand-400"
                          : "bg-white dark:bg-slate-700 hover:bg-gray-100 dark:hover:bg-slate-600"
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              {/* Avatar Image Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Avatar Image (optional)
                </label>
                <div className="flex items-center gap-4">
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center cursor-pointer hover:border-brand-500 transition-colors overflow-hidden"
                  >
                    {previewUrl ? (
                      <img
                        src={previewUrl}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <ImageIcon className="w-8 h-8 text-gray-400" />
                    )}
                  </div>
                  <div className="flex-1">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-4 py-2 bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors flex items-center gap-2"
                    >
                      <Upload className="w-4 h-4" />
                      Upload Image
                    </button>
                    <p className="text-xs text-gray-500 mt-1">
                      Max 5MB, JPG/PNG/GIF/WebP
                    </p>
                  </div>
                </div>
                {errors.avatarFile && (
                  <p className="text-red-500 text-xs mt-1">
                    {errors.avatarFile}
                  </p>
                )}
              </div>

              {/* ELO Rating */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  ELO Rating *
                </label>
                <input
                  type="number"
                  min={100}
                  max={3000}
                  value={formData.eloRating}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      eloRating: parseInt(e.target.value) || 1200,
                    })
                  }
                  className={`w-full px-4 py-2 rounded-lg border ${errors.eloRating ? "border-red-500" : "border-gray-300 dark:border-gray-600"} bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-500`}
                />
                {errors.eloRating && (
                  <p className="text-red-500 text-xs mt-1">
                    {errors.eloRating}
                  </p>
                )}
              </div>

              {/* Difficulty */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Difficulty *
                </label>
                <select
                  value={formData.difficulty}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      difficulty: e.target.value as BotFormData["difficulty"],
                    })
                  }
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-500"
                >
                  {DIFFICULTY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Category
                </label>
                <input
                  type="text"
                  value={formData.category}
                  onChange={(e) =>
                    setFormData({ ...formData, category: e.target.value })
                  }
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-500"
                  placeholder="e.g., general, historical, sports"
                />
              </div>

              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Title (GM, IM, etc.)
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-500"
                  placeholder="e.g., GM, IM, FM"
                />
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-4">
              {/* Quote */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Quote/Tagline
                </label>
                <textarea
                  value={formData.quote}
                  onChange={(e) =>
                    setFormData({ ...formData, quote: e.target.value })
                  }
                  rows={2}
                  maxLength={200}
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-500 resize-none"
                  placeholder="Bot's signature quote..."
                />
                <p className="text-xs text-gray-500 text-right">
                  {formData.quote.length}/200
                </p>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  rows={3}
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-500 resize-none"
                  placeholder="Describe this bot..."
                />
              </div>

              {/* Play Style */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Play Style
                </label>
                <select
                  value={formData.playStyle}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      playStyle: e.target.value as BotFormData["playStyle"],
                    })
                  }
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-500"
                >
                  {PLAY_STYLE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Skill Level Slider */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Skill Level: {formData.skillLevel}
                </label>
                <input
                  type="range"
                  min={0}
                  max={20}
                  value={formData.skillLevel}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      skillLevel: parseInt(e.target.value),
                    })
                  }
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-500">
                  <span>0 (Weakest)</span>
                  <span>20 (Strongest)</span>
                </div>
              </div>

              {/* Blunder Chance */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Blunder Chance: {Math.round(formData.blunderChance * 100)}%
                </label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={formData.blunderChance * 100}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      blunderChance: parseInt(e.target.value) / 100,
                    })
                  }
                  className="w-full"
                />
              </div>

              {/* Options Row */}
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.openingBook}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        openingBook: e.target.checked,
                      })
                    }
                    className="w-4 h-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    Use Opening Book
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) =>
                      setFormData({ ...formData, isActive: e.target.checked })
                    }
                    className="w-4 h-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    Active
                  </span>
                </label>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-brand-500 to-brand-500 text-white font-medium hover:from-brand-600 hover:to-brand-600 transition-colors disabled:opacity-50"
            >
              {saving ? "Saving..." : editingBot ? "Update Bot" : "Create Bot"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

