import { Trophy, Swords } from "lucide-react";
import { Link } from "react-router-dom";

export function NoGamesPlaceholder() {
  return (
    <div className="text-center py-16 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800">
      <Trophy
        size={64}
        className="mx-auto text-gray-300 dark:text-gray-600 mb-4"
      />
      <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
        No games yet
      </h3>
      <p className="text-gray-500 dark:text-gray-400 mb-6">
        Play your first game to start tracking your progress!
      </p>
      <Link
        to="/play"
        className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white px-6 py-3 rounded-xl font-bold transition-colors shadow-lg shadow-brand-500/25"
      >
        <Swords size={18} />
        Play Now
      </Link>
    </div>
  );
}

