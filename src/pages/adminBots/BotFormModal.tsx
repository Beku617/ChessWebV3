import { Trans, useTranslation } from "react-i18next";
import { useState, useRef, useEffect } from "react";
import type { BotFormData, BotData } from "./types";
import {
  DIFFICULTY_OPTIONS,
  PLAY_STYLE_OPTIONS,
  DEFAULT_BOT_FORM,
} from "./types";

const API_URL = import.meta.env.VITE_API_URL;

function resolveAvatarPreviewUrl(input: unknown): string {
  const avatarUrl = String(input || "").trim();
  if (!avatarUrl) return "";
  if (/^(https?:)?\/\//i.test(avatarUrl) || avatarUrl.startsWith("data:")) {
    return avatarUrl;
  }
  if (avatarUrl.startsWith("/BotProPic/")) {
    return avatarUrl;
  }
  return `${API_URL}${avatarUrl.startsWith("/") ? "" : "/"}${avatarUrl}`;
}

interface BotFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: BotFormData) => Promise<void>;
  editingBot: BotData | null;
  saving: boolean;
}

export function BotFormModal({
  isOpen,
  onClose,
  onSubmit,
  editingBot,
  saving,
}: BotFormModalProps) {
  const { t } = useTranslation();
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
        setPreviewUrl(resolveAvatarPreviewUrl(editingBot.avatarUrl));
      }
    } else {
      setFormData(DEFAULT_BOT_FORM);
      setPreviewUrl("");
    }
    setErrors({});
  }, [editingBot, isOpen]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    const name = formData.name.trim();

    if (!name || name.length < 2) {
      newErrors.name = "Name must be at least 2 characters";
    } else if (name.length > 50) {
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
    await onSubmit({
      ...formData,
      name: formData.name.trim(),
      avatar: formData.avatar.trim(),
      category: formData.category.trim(),
      title: formData.title.trim(),
      quote: formData.quote.trim(),
      description: formData.description.trim(),
      personality: formData.personality.trim(),
      countryCode: formData.countryCode.trim(),
    });
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-theme-panel/50 backdrop-blur-sm">
      <div className="bg-theme-panel rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-theme-glass ">
          <h2 className="text-xl font-bold text-theme-foreground ">
            {editingBot
              ? t("admin.bots.modal.editBot", "Edit Bot")
              : t("admin.bots.modal.createNewBot", "Create New Bot")}
          </h2>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-sm font-medium text-theme-muted hover:bg-theme-surface transition-colors"
          > <Trans>Close</Trans> </button>
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
                <label className="block text-sm font-medium text-theme-muted mb-1"> <Trans>Bot Name *</Trans> </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className={`w-full px-4 py-2 rounded-lg border ${errors.name ? "border-red-500" : "border-theme-glass"} bg-theme-panel text-theme-foreground focus:ring-2 focus:ring-brand-500 focus:border-transparent`}
                  placeholder={t("admin.bots.placeholders.botName", "Enter bot name")}
                />
                {errors.name && (
                  <p className="text-red-500 text-xs mt-1">{errors.name}</p>
                )}
              </div>

              {/* Avatar Image Upload */}
              <div>
                <label className="block text-sm font-medium text-theme-muted mb-1"> <Trans>Avatar Image (optional)</Trans> </label>
                <div className="flex items-center gap-4">
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="w-20 h-20 rounded-xl border-2 border-dashed border-theme-glass flex items-center justify-center cursor-pointer hover:border-brand-500 transition-colors overflow-hidden"
                  >
                    {previewUrl ? (
                      <img
                        src={previewUrl}
                        alt={t("common.preview", "Preview")}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-xs font-semibold uppercase tracking-wide text-theme-muted"> <Trans>Image</Trans> </span>
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
                      className="px-4 py-2 bg-theme-surface text-theme-muted rounded-lg hover:bg-theme-surface/80 transition-colors flex items-center gap-2"
                    > <Trans>Upload Image</Trans> </button>
                    <p className="text-xs text-theme-muted mt-1"> <Trans>Max 5MB, JPG/PNG/GIF/WebP</Trans> </p>
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
                <label className="block text-sm font-medium text-theme-muted mb-1"> <Trans>ELO Rating *</Trans> </label>
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
                  className={`w-full px-4 py-2 rounded-lg border ${errors.eloRating ? "border-red-500" : "border-theme-glass"} bg-theme-panel text-theme-foreground focus:ring-2 focus:ring-brand-500`}
                />
                {errors.eloRating && (
                  <p className="text-red-500 text-xs mt-1">
                    {errors.eloRating}
                  </p>
                )}
              </div>

              {/* Difficulty */}
              <div>
                <label className="block text-sm font-medium text-theme-muted mb-1"> <Trans>Difficulty *</Trans> </label>
                <select
                  value={formData.difficulty}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      difficulty: e.target.value as BotFormData["difficulty"],
                    })
                  }
                  className="w-full px-4 py-2 rounded-lg border border-theme-glass bg-theme-panel text-theme-foreground focus:ring-2 focus:ring-brand-500"
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
                <label className="block text-sm font-medium text-theme-muted mb-1"> <Trans>Category</Trans> </label>
                <input
                  type="text"
                  value={formData.category}
                  onChange={(e) =>
                    setFormData({ ...formData, category: e.target.value })
                  }
                  className="w-full px-4 py-2 rounded-lg border border-theme-glass bg-theme-panel text-theme-foreground focus:ring-2 focus:ring-brand-500"
                  placeholder={t("admin.bots.placeholders.categoryExample", "e.g., general, historical, sports")}
                />
              </div>

              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-theme-muted mb-1">
                  {t("admin.bots.labels.title", "Title (GM, IM, etc.)")}
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                  className="w-full px-4 py-2 rounded-lg border border-theme-glass bg-theme-panel text-theme-foreground focus:ring-2 focus:ring-brand-500"
                  placeholder={t("admin.bots.placeholders.titleExample", "e.g., GM, IM, FM")}
                />
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-4">
              {/* Quote */}
              <div>
                <label className="block text-sm font-medium text-theme-muted mb-1"> <Trans>Quote/Tagline</Trans> </label>
                <textarea
                  value={formData.quote}
                  onChange={(e) =>
                    setFormData({ ...formData, quote: e.target.value })
                  }
                  rows={2}
                  maxLength={200}
                  className="w-full px-4 py-2 rounded-lg border border-theme-glass bg-theme-panel text-theme-foreground focus:ring-2 focus:ring-brand-500 resize-none"
                  placeholder={t("admin.bots.placeholders.quote", "Bot's signature quote...")}
                />
                <p className="text-xs text-theme-muted text-right">
                  {t("admin.bots.labels.quoteCount", {
                    defaultValue: "{{count}}/200",
                    count: formData.quote.length,
                  })}
                </p>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-theme-muted mb-1"> <Trans>Description</Trans> </label>
                <textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  rows={3}
                  className="w-full px-4 py-2 rounded-lg border border-theme-glass bg-theme-panel text-theme-foreground focus:ring-2 focus:ring-brand-500 resize-none"
                  placeholder={t("admin.bots.placeholders.description", "Describe this bot...")}
                />
              </div>

              {/* Play Style */}
              <div>
                <label className="block text-sm font-medium text-theme-muted mb-1"> <Trans>Play Style</Trans> </label>
                <select
                  value={formData.playStyle}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      playStyle: e.target.value as BotFormData["playStyle"],
                    })
                  }
                  className="w-full px-4 py-2 rounded-lg border border-theme-glass bg-theme-panel text-theme-foreground focus:ring-2 focus:ring-brand-500"
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
                <label className="block text-sm font-medium text-theme-muted mb-1"> <Trans>Skill Level:</Trans> {formData.skillLevel}
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
                <div className="flex justify-between text-xs text-theme-muted">
                  <span><Trans>0 (Weakest)</Trans></span>
                  <span><Trans>20 (Strongest)</Trans></span>
                </div>
              </div>

              {/* Blunder Chance */}
              <div>
                <label className="block text-sm font-medium text-theme-muted mb-1">
                  <Trans>Blunder Chance:</Trans>{" "}
                  {t("admin.bots.labels.percentValue", {
                    defaultValue: "{{value}}%",
                    value: Math.round(formData.blunderChance * 100),
                  })}
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
                    className="w-4 h-4 rounded border-theme-glass text-brand-500 focus:ring-brand-500"
                  />
                  <span className="text-sm text-theme-muted"> <Trans>Use Opening Book</Trans> </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) =>
                      setFormData({ ...formData, isActive: e.target.checked })
                    }
                    className="w-4 h-4 rounded border-theme-glass text-brand-500 focus:ring-brand-500"
                  />
                  <span className="text-sm text-theme-muted"> <Trans>Active</Trans> </span>
                </label>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-theme-glass ">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 rounded-lg border border-theme-glass text-theme-muted hover:bg-theme-surface transition-colors"
            > <Trans>Cancel</Trans> </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-brand-500 to-brand-500 text-theme-on-accent font-medium hover:from-brand-600 hover:to-brand-600 transition-colors disabled:opacity-50"
            >
              {saving
                ? t("admin.bots.actions.saving", "Saving...")
                : editingBot
                  ? t("admin.bots.actions.updateBot", "Update Bot")
                  : t("admin.bots.actions.createBot", "Create Bot")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

