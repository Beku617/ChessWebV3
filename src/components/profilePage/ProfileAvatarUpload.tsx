import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, X, Upload, Loader2 } from "lucide-react";
import { useTranslation, Trans } from "react-i18next";
import { useAuthStore, authApi } from "../../store/authStore";

interface ProfileAvatarUploadProps {
  currentAvatar?: string;
  userName?: string;
  onAvatarChange?: (newAvatar: string) => void;
  onPersistAvatar?: (avatar: string) => Promise<string | void>;
  size?: "md" | "lg" | "xl";
  editable?: boolean;
}

export function ProfileAvatarUpload({
  currentAvatar,
  userName,
  onAvatarChange,
  onPersistAvatar,
  size = "md",
  editable = true,
}: ProfileAvatarUploadProps) {
  const { t } = useTranslation();
  const { setUser, user } = useAuthStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resolveAvatar = (avatar?: string) => {
    if (!avatar) return "";
    if (
      avatar.startsWith("http://") ||
      avatar.startsWith("https://") ||
      avatar.startsWith("data:") ||
      avatar.startsWith("blob:")
    ) {
      return avatar;
    }
    const base = import.meta.env.VITE_API_URL || "http://localhost:3001";
    return `${base}${avatar.startsWith("/") ? "" : "/"}${avatar}`;
  };

  const getInitials = (name?: string) => {
    return (
      name
        ?.split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2) || "U"
    );
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file");
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      setError("Image must be smaller than 2MB");
      return;
    }

    setError(null);

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreviewUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleUpload = async () => {
    if (!previewUrl) return;

    setIsUploading(true);
    setError(null);

    try {
      if (onPersistAvatar) {
        const nextAvatar = await onPersistAvatar(previewUrl);
        onAvatarChange?.(nextAvatar || previewUrl);
      } else {
        // The previewUrl is already a base64 data URL
        const updatedUser = await authApi.updateProfile({ avatar: previewUrl });

        // Update the auth store with new user data
        if (user && updatedUser) {
          setUser({ ...user, avatar: updatedUser.avatar });
        }

        onAvatarChange?.(previewUrl);
      }
      setIsModalOpen(false);
      setPreviewUrl(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload avatar");
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveAvatar = async () => {
    setIsUploading(true);
    setError(null);

    try {
      if (onPersistAvatar) {
        const nextAvatar = await onPersistAvatar("");
        onAvatarChange?.(nextAvatar || "");
      } else {
        const updatedUser = await authApi.updateProfile({ avatar: "" });

        if (user && updatedUser) {
          setUser({ ...user, avatar: "" });
        }

        onAvatarChange?.("");
      }
      setIsModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove avatar");
    } finally {
      setIsUploading(false);
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setPreviewUrl(null);
    setError(null);
  };

  const avatarSizeClass =
    size === "xl" ? "w-40 h-40" : size === "lg" ? "w-32 h-32" : "w-28 h-28";
  const initialsClass = size === "xl" ? "text-5xl" : "text-4xl";
  const editButtonClass =
    size === "xl" ? "w-10 h-10" : size === "lg" ? "w-9 h-9" : "w-9 h-9";

  return (
    <>
      {/* Avatar with edit button */}
      <div className="relative group">
        <div
          className={`${avatarSizeClass} rounded-2xl bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center shadow-lg ring-4 ring-white dark:ring-gray-900 overflow-hidden`}
        >
          {currentAvatar ? (
            <img
              src={resolveAvatar(currentAvatar)}
              alt={userName || "Profile"}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className={`text-white font-bold ${initialsClass}`}>
              {getInitials(userName)}
            </span>
          )}
        </div>

        {/* Edit button overlay */}
        {editable && (
          <button
            onClick={() => setIsModalOpen(true)}
            className={`absolute bottom-0 right-0 ${editButtonClass} bg-white dark:bg-gray-800 rounded-full shadow-lg flex items-center justify-center border-2 border-white dark:border-gray-900 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors group-hover:scale-110`}
            title={t("profile.avatar.change")}
          >
            <Camera size={16} className="text-gray-700 dark:text-gray-300" />
          </button>
        )}
      </div>

      {/* Upload Modal */}
      <AnimatePresence>
        {editable && isModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={closeModal}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md p-6"
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white"> <Trans>Update Profile Picture</Trans> </h3>
                <button
                  onClick={closeModal}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                >
                  <X size={20} className="text-gray-500" />
                </button>
              </div>

              {/* Preview Area */}
              <div className="flex flex-col items-center mb-6">
                <div className="w-32 h-32 rounded-full bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center overflow-hidden ring-4 ring-gray-200 dark:ring-gray-700">
                  {previewUrl ? (
                    <img
                      src={previewUrl}
                      alt="Preview"
                      className="w-full h-full object-cover"
                    />
                  ) : currentAvatar ? (
                    <img
                      src={resolveAvatar(currentAvatar)}
                      alt="Current"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-white font-bold text-3xl">
                      {getInitials(userName)}
                    </span>
                  )}
                </div>

                {previewUrl && (
                  <button
                    onClick={() => setPreviewUrl(null)}
                    className="mt-3 text-sm text-red-500 hover:text-red-600 flex items-center gap-1"
                  >
                    <X size={14} /> <Trans>Clear selection</Trans> </button>
                )}
              </div>

              {/* Error Message */}
              {error && (
                <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-sm">
                  {error}
                </div>
              )}

              {/* File Input */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept="image/*"
                className="hidden"
              />

              {/* Actions */}
              <div className="space-y-3">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-3 px-4 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-xl text-gray-700 dark:text-gray-200 font-medium flex items-center justify-center gap-2 transition-colors"
                >
                  <Upload size={18} /> <Trans>Choose Image</Trans> </button>

                {previewUrl && (
                  <button
                    onClick={handleUpload}
                    disabled={isUploading}
                    className="w-full py-3 px-4 bg-brand-500 hover:bg-brand-600 disabled:bg-brand-400 rounded-xl text-white font-medium flex items-center justify-center gap-2 transition-colors"
                  >
                    {isUploading ? (
                      <>
                        <Loader2 size={18} className="animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Camera size={18} /> <Trans>Save Avatar</Trans> </>
                    )}
                  </button>
                )}

                {currentAvatar && !previewUrl && (
                  <button
                    onClick={handleRemoveAvatar}
                    disabled={isUploading}
                    className="w-full py-3 px-4 border border-red-300 dark:border-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl text-red-600 dark:text-red-400 font-medium flex items-center justify-center gap-2 transition-colors"
                  >
                    {isUploading ? (
                      <>
                        <Loader2 size={18} className="animate-spin" />
                        Removing...
                      </>
                    ) : (
                      <>
                        <X size={18} /> <Trans>Remove Avatar</Trans> </>
                    )}
                  </button>
                )}
              </div>

              {/* Help text */}
              <p className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400"> <Trans>Supported formats: JPG, PNG, GIF. Max size: 2MB</Trans> </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

