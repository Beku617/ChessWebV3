import { motion } from "framer-motion";

interface StatCardProps {
  title: string;
  value: string | number;
  subtext?: string;
  icon?: React.ComponentType<{ className?: string }>;
  gradient?: string;
}

export function StatCard({
  title,
  value,
  subtext,
  gradient,
}: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative overflow-hidden rounded-2xl p-5 border border-gray-200 dark:border-gray-800 shadow-sm hover:shadow-lg transition-all ${gradient || "bg-white dark:bg-gray-900"}`}
    >
      {gradient && (
        <div className="absolute inset-0 opacity-10 bg-gradient-to-br from-white to-transparent" />
      )}
      <div className="relative z-10">
        <div className="flex justify-between items-start mb-3">
          {subtext && (
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2.5 py-1 rounded-full">
              {subtext}
            </span>
          )}
        </div>
        <h3
          className={`text-sm font-medium mb-1 ${gradient ? "text-white/70" : "text-gray-500 dark:text-gray-400"}`}
        >
          {title}
        </h3>
        <p
          className={`text-2xl font-bold ${gradient ? "text-white" : "text-gray-900 dark:text-white"}`}
        >
          {value}
        </p>
      </div>
    </motion.div>
  );
}
