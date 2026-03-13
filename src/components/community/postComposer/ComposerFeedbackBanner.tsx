import { AlertCircle, ShieldCheck } from "lucide-react";

interface ComposerFeedbackBannerProps {
  error: string;
  successMessage: string;
  submissionBlockedMessage: string;
}

export function ComposerFeedbackBanner({
  error,
  successMessage,
  submissionBlockedMessage,
}: ComposerFeedbackBannerProps) {
  if (!error && !successMessage && !submissionBlockedMessage) {
    return null;
  }

  return (
    <div
      className={`mt-3 flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-sm ${
        error
          ? "bg-red-500/10 text-red-200"
          : submissionBlockedMessage
            ? "bg-amber-500/10 text-amber-100"
            : "bg-teal-500/10 text-teal-100"
      }`}
    >
      {error || submissionBlockedMessage ? (
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      ) : (
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
      )}
      <span>{error || submissionBlockedMessage || successMessage}</span>
    </div>
  );
}
