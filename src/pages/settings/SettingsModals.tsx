import type { TFunction } from "i18next";
import { Modal } from "../../components/settings";
import type { PasswordFields } from "./types";

interface SettingsModalsProps {
  passwordModal: boolean;
  deleteModal: boolean;
  deleteConfirmTarget: string;
  deleteConfirmText: string;
  pwFields: PasswordFields;
  showToast: (message: string, type?: "success" | "error") => void;
  t: TFunction;
  onClosePasswordModal: () => void;
  onCloseDeleteModal: () => void;
  onDeleteConfirmTextChange: (value: string) => void;
  onPwFieldsChange: (patch: Partial<PasswordFields>) => void;
}

export function SettingsModals({
  passwordModal,
  deleteModal,
  deleteConfirmTarget,
  deleteConfirmText,
  pwFields,
  showToast,
  t,
  onClosePasswordModal,
  onCloseDeleteModal,
  onDeleteConfirmTextChange,
  onPwFieldsChange,
}: SettingsModalsProps) {
  return (
    <>
      <Modal
        open={passwordModal}
        onClose={onClosePasswordModal}
        title={t("settings.modals.changePassword.title", "Change Password")}
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              {t("settings.modals.changePassword.current", "Current Password")}
            </label>
            <input
              type="password"
              value={pwFields.current}
              onChange={(event) => onPwFieldsChange({ current: event.target.value })}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm transition-all focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/40 dark:border-gray-700 dark:bg-gray-800"
              placeholder={t(
                "settings.modals.changePassword.currentPlaceholder",
                "Enter current password",
              )}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              {t("settings.modals.changePassword.new", "New Password")}
            </label>
            <input
              type="password"
              value={pwFields.newPw}
              onChange={(event) => onPwFieldsChange({ newPw: event.target.value })}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm transition-all focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/40 dark:border-gray-700 dark:bg-gray-800"
              placeholder={t(
                "settings.modals.changePassword.newPlaceholder",
                "Enter new password",
              )}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              {t("settings.modals.changePassword.confirm", "Confirm Password")}
            </label>
            <input
              type="password"
              value={pwFields.confirm}
              onChange={(event) => onPwFieldsChange({ confirm: event.target.value })}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm transition-all focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/40 dark:border-gray-700 dark:bg-gray-800"
              placeholder={t(
                "settings.modals.changePassword.confirmPlaceholder",
                "Confirm new password",
              )}
            />
          </div>
          <button
            disabled={!pwFields.current || !pwFields.newPw || pwFields.newPw !== pwFields.confirm}
            onClick={() => {
              showToast(t("settings.toasts.passwordChanged", "Password changed successfully!"));
              onClosePasswordModal();
            }}
            className="w-full rounded-xl bg-teal-600 py-2.5 text-sm font-bold text-white transition-all hover:bg-teal-500 disabled:bg-gray-300 disabled:text-gray-500 dark:disabled:bg-gray-800"
          >
            {t("settings.modals.changePassword.cta", "Update Password")}
          </button>
        </div>
      </Modal>

      <Modal
        open={deleteModal}
        onClose={onCloseDeleteModal}
        title={t("settings.modals.delete.title", "Delete Account")}
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-800/40 dark:bg-red-900/20">
            <p className="text-sm font-medium text-red-600 dark:text-red-400">
              {t(
                "settings.modals.delete.warning",
                "This action is permanent and cannot be undone. All your games, ratings, and data will be lost.",
              )}
            </p>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-500 dark:text-gray-400">
              {t("settings.modals.delete.confirmLabel", {
                defaultValue: "Type {{name}} to confirm",
                name: deleteConfirmTarget,
              })}
            </label>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(event) => onDeleteConfirmTextChange(event.target.value)}
              className="w-full rounded-xl border border-red-200 bg-gray-50 px-4 py-2.5 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-red-500/40 dark:border-red-800/40 dark:bg-gray-800"
              placeholder={deleteConfirmTarget}
            />
          </div>
          <button
            disabled={deleteConfirmText !== deleteConfirmTarget}
            onClick={() => {
              showToast(
                t("settings.toasts.deletionRequested", "Account deletion requested"),
                "error",
              );
              onCloseDeleteModal();
            }}
            className="w-full rounded-xl bg-red-600 py-2.5 text-sm font-bold text-white transition-all hover:bg-red-500 disabled:bg-gray-300 disabled:text-gray-500 dark:disabled:bg-gray-800"
          >
            {t("settings.modals.delete.cta", "Permanently Delete Account")}
          </button>
        </div>
      </Modal>
    </>
  );
}
