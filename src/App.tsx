import { lazy, Suspense, useEffect } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  useLocation,
  Navigate,
} from "react-router-dom";
import Sidebar from "./components/Sidebar";
import { useThemeStore } from "./store/themeStore";
import { useAuthStore, authApi } from "./store/authStore";
import { useFriendChallengeStore } from "./store/friendChallengeStore";
import { useFriendStore } from "./store/friendStore";
import FriendChallengeOverlay from "./components/FriendChallengeOverlay";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Game = lazy(() => import("./pages/game"));
const PlayWithBot = lazy(async () => {
  const module = await import("./pages/playWithBot");
  return { default: module.default };
});
const BotGamePage = lazy(async () => {
  const module = await import("./pages/playWithBot");
  return { default: module.BotGamePage };
});
const QuickMatch = lazy(() => import("./pages/quickMatch"));
const PlayWithFriend = lazy(() => import("./pages/playWithFriend"));
const PlayVariants = lazy(() => import("./pages/playVariants"));
const PlayFourPlayer = lazy(() => import("./pages/playFourPlayer"));
const PlayPractice = lazy(() => import("./pages/playPractice"));
const Puzzles = lazy(() => import("./pages/puzzles"));
const PuzzleTrainer = lazy(() => import("./pages/puzzleTrainer"));
const Learn = lazy(() => import("./pages/Learn"));
const Tournaments = lazy(() => import("./pages/tournaments"));
const Watch = lazy(() => import("./pages/watch"));
const Community = lazy(() => import("./pages/Community"));
const CommunityGroups = lazy(() => import("./pages/CommunityGroups"));
const CommunityGroupDetail = lazy(() => import("./pages/CommunityGroupDetail"));
const Friends = lazy(() => import("./pages/friends"));
const Settings = lazy(() => import("./pages/Settings"));
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const Profile = lazy(() => import("./pages/Profile"));
const UserProfile = lazy(() => import("./pages/UserProfile"));
const Analyze = lazy(() => import("./pages/analyze"));
const Analyze960 = lazy(() => import("./pages/analyze960"));
const AdminDashboard = lazy(() => import("./pages/adminDashboard"));
const AdminUsers = lazy(() => import("./pages/adminUsers"));
const AdminUserProfile = lazy(() => import("./pages/AdminUserProfile"));
const AdminAnalyze = lazy(() => import("./pages/adminAnalyze"));
const AdminPuzzles = lazy(() => import("./pages/AdminPuzzles"));
const AdminBots = lazy(async () => {
  const module = await import("./pages/adminBots");
  return { default: module.AdminBots };
});
const AdminFeaturedEvents = lazy(async () => {
  const module = await import("./pages/adminFeaturedEvents");
  return { default: module.AdminFeaturedEvents };
});
const AdminGames = lazy(async () => {
  const module = await import("./pages/adminGames");
  return { default: module.AdminGames };
});
const AdminCommunity = lazy(() => import("./pages/adminCommunity"));
const AdminGroups = lazy(() => import("./pages/adminGroups"));
const Messages = lazy(async () => {
  const module = await import("./pages/messages");
  return { default: module.Messages };
});

// Auth check component
function AuthChecker() {
  const { setUser, setLoading, setBanned } = useAuthStore();

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const user = await authApi.getMe();
        setUser(user);
      } catch (err: unknown) {
        // Check if user was banned
        if (err && typeof err === "object" && "banned" in err) {
          const banErr = err as { banned: boolean; banReason: string };
          setBanned(banErr.banReason);
        } else {
          setUser(null);
        }
      }
    };
    checkAuth();
  }, [setUser, setLoading, setBanned]);

  return null;
}

// Protected Route wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthStore();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] dark:bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

// Redirect if already logged in
function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] dark:bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function ThemeController() {
  const { isDarkMode } = useThemeStore();

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [isDarkMode]);

  return null;
}

function RealtimeBridge() {
  const { isAuthenticated, user } = useAuthStore();
  const initialize = useFriendChallengeStore((state) => state.initialize);
  const disconnect = useFriendChallengeStore((state) => state.disconnect);
  const socket = useFriendChallengeStore((state) => state.socket);
  const bindFriendSocket = useFriendStore((state) => state.bindSocket);
  const loadFriends = useFriendStore((state) => state.loadAll);
  const resetFriends = useFriendStore((state) => state.reset);

  useEffect(() => {
    if (isAuthenticated && user) {
      initialize(user);
      void loadFriends();
      return;
    }
    disconnect();
    resetFriends();
    bindFriendSocket(null);
  }, [disconnect, initialize, isAuthenticated, user, loadFriends, resetFriends, bindFriendSocket]);

  useEffect(() => {
    bindFriendSocket(socket);
  }, [socket, bindFriendSocket]);

  return null;
}

function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const isDashboardPage = location.pathname === "/";
  const isGamePage =
    location.pathname === "/play" ||
    location.pathname === "/play/bot" ||
    location.pathname === "/play/quick" ||
    location.pathname === "/play/friend" ||
    location.pathname === "/play/variants" ||
    location.pathname === "/play/four-player" ||
    location.pathname === "/play/practice";

  // Pages that have their own sidebar or are auth pages
  const hasOwnLayout =
    [
      "/watch",
      "/friends",
      "/messages",
      "/settings",
      "/login",
      "/register",
      "/profile",
    ].includes(location.pathname) ||
    location.pathname.startsWith("/community") ||
    location.pathname.startsWith("/u/") ||
    location.pathname.startsWith("/puzzles/train") ||
    location.pathname.startsWith("/analyze") ||
    location.pathname.startsWith("/admin") ||
    location.pathname.match(/^\/play\/bot\/.+/);

  // For pages with their own layout, just render children
  if (hasOwnLayout) {
    return <>{children}</>;
  }

  return (
    <div
      className={`bg-[#f5f5f7] dark:bg-gray-950 text-gray-900 dark:text-white font-sans selection:bg-teal-500/30 transition-colors duration-300 ${
        isGamePage ? "h-screen overflow-hidden" : "min-h-screen"
      }`}
    >
      <Sidebar />

      {/* Main Content Wrapper */}
      <div
        className={`flex-1 flex flex-col ml-72 relative z-10 ${
          isGamePage ? "h-screen overflow-hidden" : "min-h-screen"
        }`}
      >
        {/* Main Content */}
        <main
          className={`w-full flex-1 flex flex-col ${
            isGamePage
              ? "min-h-0 overflow-hidden px-0 py-0"
              : isDashboardPage
                ? "w-full px-4 sm:px-5 lg:px-6 xl:px-8 py-8"
                : "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8"
          }`}
        >
          {children}
        </main>
      </div>
    </div>
  );
}

function RouteFallback() {
  return (
    <div className="min-h-screen bg-[#f5f5f7] dark:bg-gray-950 flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function App() {
  return (
    <Router
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <ThemeController />
      <AuthChecker />
      <RealtimeBridge />
      <Layout>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            {/* Public routes - redirect to home if logged in */}
            <Route
              path="/login"
              element={
                <PublicRoute>
                  <Login />
                </PublicRoute>
              }
            />
            <Route
              path="/register"
              element={
                <PublicRoute>
                  <Register />
                </PublicRoute>
              }
            />

            {/* Protected routes - redirect to login if not logged in */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/play"
              element={
                <ProtectedRoute>
                  <Game />
                </ProtectedRoute>
              }
            />
            <Route
              path="/play/bot"
              element={
                <ProtectedRoute>
                  <PlayWithBot />
                </ProtectedRoute>
              }
            />
            <Route
              path="/play/bot/:botId"
              element={
                <ProtectedRoute>
                  <BotGamePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/play/quick"
              element={
                <ProtectedRoute>
                  <QuickMatch />
                </ProtectedRoute>
              }
            />
            <Route
              path="/play/variants"
              element={
                <ProtectedRoute>
                  <PlayVariants />
                </ProtectedRoute>
              }
            />
            <Route
              path="/play/four-player"
              element={
                <ProtectedRoute>
                  <PlayFourPlayer />
                </ProtectedRoute>
              }
            />
            <Route
              path="/play/practice"
              element={
                <ProtectedRoute>
                  <PlayPractice />
                </ProtectedRoute>
              }
            />
            <Route
              path="/play/friend"
              element={
                <ProtectedRoute>
                  <PlayWithFriend />
                </ProtectedRoute>
              }
            />
            <Route
              path="/puzzles"
              element={
                <ProtectedRoute>
                  <Puzzles />
                </ProtectedRoute>
              }
            />
            <Route
              path="/puzzles/train/:puzzleId?"
              element={
                <ProtectedRoute>
                  <PuzzleTrainer />
                </ProtectedRoute>
              }
            />
            <Route
              path="/learn"
              element={
                <ProtectedRoute>
                  <Learn />
                </ProtectedRoute>
              }
            />
            <Route
              path="/tournaments"
              element={
                <ProtectedRoute>
                  <Tournaments />
                </ProtectedRoute>
              }
            />
            <Route
              path="/watch"
              element={
                <ProtectedRoute>
                  <Watch />
                </ProtectedRoute>
              }
            />
            <Route
              path="/community"
              element={
                <ProtectedRoute>
                  <Community />
                </ProtectedRoute>
              }
            />
            <Route
              path="/community/groups"
              element={
                <ProtectedRoute>
                  <CommunityGroups />
                </ProtectedRoute>
              }
            />
            <Route
              path="/community/groups/:groupIdentifier"
              element={
                <ProtectedRoute>
                  <CommunityGroupDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/friends"
              element={
                <ProtectedRoute>
                  <Friends />
                </ProtectedRoute>
              }
            />
            <Route
              path="/messages"
              element={
                <ProtectedRoute>
                  <Messages />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <Settings />
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <Profile />
                </ProtectedRoute>
              }
            />
            <Route
              path="/u/:userId"
              element={<UserProfile />}
            />
            <Route
              path="/analyze/:gameId"
              element={<Analyze />}
            />
            <Route
              path="/analyze960/:gameId"
              element={<Analyze960 />}
            />

            {/* Admin dashboard - uses same login page, admin auth checked inside */}
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="/admin/users/:userId" element={<AdminUserProfile />} />
            <Route path="/admin/puzzles" element={<AdminPuzzles />} />
            <Route path="/admin/bots" element={<AdminBots />} />
            <Route path="/admin/events" element={<AdminFeaturedEvents />} />
            <Route path="/admin/games" element={<AdminGames />} />
            <Route path="/admin/community" element={<AdminCommunity />} />
            <Route path="/admin/groups" element={<AdminGroups />} />
            <Route path="/admin/analyze/:gameId" element={<AdminAnalyze />} />
          </Routes>
        </Suspense>
      </Layout>
      <FriendChallengeOverlay />
    </Router>
  );
}

export default App;
