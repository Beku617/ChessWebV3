import { TabType } from "./constants";

interface TabSelectorProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
}

export function TabSelector({ activeTab, setActiveTab }: TabSelectorProps) {
  return (
    <div className="flex gap-2 mb-6">
      <button
        onClick={() => setActiveTab("bots")}
        className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
          activeTab === "bots"
            ? "bg-brand-600 text-white"
            : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
        }`}
      >
        🤖 Play vs Bot
      </button>
      <button
        onClick={() => setActiveTab("custom")}
        className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
          activeTab === "custom"
            ? "bg-brand-600 text-white"
            : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
        }`}
      >
        ⚙️ Custom Level
      </button>
    </div>
  );
}

