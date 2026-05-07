import { useNavigate } from "react-router-dom";
import Sidebar from "../components/Sidebar";

interface NotFoundProps {
  withSidebar?: boolean;
}

function NotFoundContent() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-[#f5f5f7] px-6 text-gray-900 dark:bg-gray-950 dark:text-white">
      <div className="text-center">
        <div className="text-sm font-semibold uppercase tracking-[0.18em] text-brand-500">
          404
        </div>
        <h1 className="mt-3 text-3xl font-bold">Page not found</h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          The page you requested could not be found.
        </p>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mt-5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
        >
          Go Back
        </button>
      </div>
    </div>
  );
}

export default function NotFound({ withSidebar = false }: NotFoundProps) {
  if (!withSidebar) {
    return <NotFoundContent />;
  }

  return (
    <div className="flex min-h-screen bg-[#f5f5f7] dark:bg-gray-950">
      <Sidebar />
      <div className="ml-[60px] flex min-h-screen flex-1 md:ml-72">
        <NotFoundContent />
      </div>
    </div>
  );
}
