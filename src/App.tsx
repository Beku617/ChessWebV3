import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import {
  Routes,
  Route,
  useLocation,
  Navigate,
  useNavigate,
  useBlocker,
  useBeforeUnload,
} from "react-router-dom";
import Sidebar from "./components/Sidebar";
import { useThemeStore } from "./store/themeStore";
import { useAuthStore, authApi } from "./store/authStore";
import { useFriendChallengeStore } from "./store/friendChallengeStore";
import { useFriendStore } from "./store/friendStore";
import FriendChallengeOverlay from "./components/FriendChallengeOverlay";
import { applyThemeClass } from "./utils/theme";
import { useTheme } from "./hooks/useTheme";
import {
  buildActiveOnlineGamePath,
  clearActiveOnlineGame,
  isOnlineGameRoute,
  readActiveOnlineGame,
  sessionResponseToRecord,
  setActiveGameRedirectNotice,
  storeActiveOnlineGame,
  type ActiveOnlineGameSessionResponse,
} from "./utils/activeOnlineGame";

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
const PuzzleHistory = lazy(() => import("./pages/puzzles/PuzzleHistory"));
const PuzzleTrainer = lazy(() => import("./pages/puzzleTrainer"));
const Learn = lazy(() => import("./pages/Learn"));
const LearnLesson = lazy(() => import("./pages/LearnLesson"));
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
const AdminTournaments = lazy(() => import("./pages/adminTournaments"));
const AdminGames = lazy(async () => {
  const module = await import("./pages/adminGames");
  return { default: module.AdminGames };
});
const AdminCommunity = lazy(() => import("./pages/adminCommunity"));
const AdminGroups = lazy(() => import("./pages/adminGroups"));
const AdminLearn = lazy(() => import("./pages/adminLearn"));
const AdminLearnCourse = lazy(() => import("./pages/adminLearn/AdminLearnCourse"));
const AdminLearnLesson = lazy(() => import("./pages/adminLearn/AdminLearnLesson"));
const AdminProfile = lazy(() => import("./pages/adminProfile"));
const Messages = lazy(async () => {
  const module = await import("./pages/messages");
  return { default: module.Messages };
});
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

// Auth check component
function AuthChecker() {
  const location = useLocation();
  const { setUser, setLoading, setBanned } = useAuthStore();

  useEffect(() => {
    if (location.pathname.startsWith("/admin")) {
      setLoading(false);
      return;
    }

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
  }, [location.pathname, setUser, setLoading, setBanned]);

  return null;
}

// Protected Route wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthStore();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-theme-primary flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
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
      <div className="min-h-screen bg-theme-primary flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function ThemeController() {
  const { themeName } = useTheme();

  useLayoutEffect(() => {
    applyThemeClass(themeName);
  }, [themeName]);

  return null;
}

function RealtimeBridge() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuthStore();
  const initialize = useFriendChallengeStore((state) => state.initialize);
  const disconnect = useFriendChallengeStore((state) => state.disconnect);
  const socket = useFriendChallengeStore((state) => state.socket);
  const bindFriendSocket = useFriendStore((state) => state.bindSocket);
  const loadFriends = useFriendStore((state) => state.loadAll);
  const resetFriends = useFriendStore((state) => state.reset);
  const lastTournamentRedirectRef = useRef<string>("");

  useEffect(() => {
    if (location.pathname.startsWith("/admin")) {
      disconnect();
      resetFriends();
      bindFriendSocket(null);
      return;
    }

    if (isAuthenticated && user) {
      initialize(user);
      void loadFriends();
      return;
    }
    disconnect();
    resetFriends();
    bindFriendSocket(null);
  }, [
    disconnect,
    initialize,
    isAuthenticated,
    user,
    loadFriends,
    resetFriends,
    bindFriendSocket,
    location.pathname,
  ]);

  useEffect(() => {
    bindFriendSocket(socket);
  }, [socket, bindFriendSocket]);

  useEffect(() => {
    if (!socket || !isAuthenticated || !user) return;

    const handleTournamentBoardAssigned = (payload?: {
      gameId?: string;
      tournamentId?: string;
      round?: number;
      autoStart?: boolean;
    }) => {
      const gameId = String(payload?.gameId || "").trim();
      if (!gameId) return;

      const signature = `${payload?.tournamentId || ""}:${payload?.round || 0}:${gameId}`;
      if (lastTournamentRedirectRef.current === signature) return;
      lastTournamentRedirectRef.current = signature;

      if (
        location.pathname === "/play/quick" &&
        location.search.includes(`tournamentGameId=${encodeURIComponent(gameId)}`)
      ) {
        return;
      }

      navigate(`/play/quick?tournamentGameId=${encodeURIComponent(gameId)}`, {
        state: { tournamentGameId: gameId, autoStart: true },
      });
    };

    socket.on("tournament:boardAssigned", handleTournamentBoardAssigned);
    return () => {
      socket.off("tournament:boardAssigned", handleTournamentBoardAssigned);
    };
  }, [isAuthenticated, location.pathname, location.search, navigate, socket, user]);

  return null;
}

function getActiveGameRedirectMessage(pathname: string) {
  const normalized = String(pathname || "").toLowerCase();
  if (
    normalized.startsWith("/puzzles") ||
    normalized.startsWith("/play/bot") ||
    normalized.startsWith("/play/practice")
  ) {
    return "You were redirected because you already have an active online game in progress.";
  }
  return "You already have an active game in progress.";
}

function ActiveGameGuard() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useAuthStore();
  const handlingBlockedNavigationRef = useRef(false);
  const allowGuardRedirectRef = useRef(false);

  useEffect(() => {
    allowGuardRedirectRef.current = false;
  }, [location.pathname, location.search]);

  useBeforeUnload(
    useCallback((event: BeforeUnloadEvent) => {
      const activeGame = readActiveOnlineGame();
      if (!activeGame?.gameId) return;
      if (!isOnlineGameRoute(location.pathname)) return;
      event.preventDefault();
      event.returnValue = "";
    }, [location.pathname]),
  );

  const blocker = useBlocker(
    useCallback(
      ({ currentLocation, nextLocation }) => {
        if (allowGuardRedirectRef.current) return false;
        const activeGame = readActiveOnlineGame();
        if (!activeGame?.gameId) return false;
        if (!isOnlineGameRoute(currentLocation.pathname)) return false;
        const currentUrl = `${currentLocation.pathname}${currentLocation.search}${currentLocation.hash}`;
        const nextUrl = `${nextLocation.pathname}${nextLocation.search}${nextLocation.hash}`;
        return currentUrl !== nextUrl;
      },
      [],
    ),
  );

  useEffect(() => {
    if (blocker.state !== "blocked" || handlingBlockedNavigationRef.current) {
      return;
    }
    handlingBlockedNavigationRef.current = true;

    const shouldLeave = window.confirm(
      "You are currently in a game. If you leave, you may forfeit. Do you want to resign and leave?",
    );

    if (!shouldLeave) {
      blocker.reset();
      handlingBlockedNavigationRef.current = false;
      return;
    }

    const activeGame = readActiveOnlineGame();

    void (async () => {
      try {
        if (activeGame?.gameId) {
          await fetch(`${API_URL}/api/active-game/resign`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ gameId: activeGame.gameId }),
          });
        }
      } catch {
        // Navigation should continue even if the resign request fails client-side.
      } finally {
        clearActiveOnlineGame();
        blocker.proceed();
        handlingBlockedNavigationRef.current = false;
      }
    })();
  }, [blocker]);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      clearActiveOnlineGame();
      return;
    }
    if (location.pathname.startsWith("/admin")) return;

    const controller = new AbortController();

    void (async () => {
      try {
        const response = await fetch(`${API_URL}/api/active-game`, {
          credentials: "include",
          signal: controller.signal,
        });
        if (!response.ok) {
          if (response.status === 401) return;
          throw new Error("Failed to load active game");
        }

        const payload =
          (await response.json()) as ActiveOnlineGameSessionResponse;
        if (!payload.active || !payload.session) {
          clearActiveOnlineGame();
          return;
        }

        const activeGame = sessionResponseToRecord(payload.session);
        if (!activeGame) {
          clearActiveOnlineGame();
          return;
        }

        storeActiveOnlineGame(activeGame);

        const targetPath = buildActiveOnlineGamePath(activeGame);
        const targetPrefix = targetPath.split("?")[0];
        const alreadyOnTargetRoute = location.pathname.startsWith(targetPrefix);

        if (!alreadyOnTargetRoute) {
          setActiveGameRedirectNotice(
            getActiveGameRedirectMessage(location.pathname),
          );
          allowGuardRedirectRef.current = true;
          navigate(targetPath, { replace: true });
        }
      } catch (error) {
        if ((error as { name?: string })?.name === "AbortError") return;
      }
    })();

    return () => {
      controller.abort();
    };
  }, [isAuthenticated, isLoading, location.pathname, navigate]);

  return null;
}

function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { isDarkMode } = useThemeStore();
  const isDashboardPage = location.pathname === "/";
  const isTournamentPage = location.pathname.startsWith("/tournaments");
  const isLearnLessonPage = /^\/learn\/[^/]+\/[^/]+$/.test(location.pathname);
  const isGamePage =
    location.pathname === "/play" ||
    location.pathname === "/play/bot" ||
    location.pathname === "/play/quick" ||
    location.pathname === "/play/friend" ||
    location.pathname === "/play/variants" ||
    location.pathname === "/play/four-player" ||
    location.pathname.startsWith("/play/practice");
  const isWorkspacePage = isGamePage || isLearnLessonPage;
  const sidebarOffsetClass = "ml-[60px] md:ml-72";

  const isAdminRoute = location.pathname.startsWith("/admin");

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

  if (isAdminRoute) {
    return <div className={isDarkMode ? "dark" : ""}>{children}</div>;
  }

  // For pages with their own layout, just render children
  if (hasOwnLayout) {
    return <>{children}</>;
  }

  return (
    <div
      className={`bg-theme-primary text-gray-900 dark:text-white font-sans selection:bg-brand-500/30 transition-colors duration-300 ${
        isWorkspacePage ? "h-screen overflow-hidden" : "min-h-screen"
      }`}
    >
      <Sidebar />

      {/* Main Content Wrapper */}
      <div
        className={`flex-1 flex flex-col ${sidebarOffsetClass} relative z-10 ${
          isWorkspacePage ? "h-screen overflow-hidden" : "min-h-screen"
        }`}
      >
        {/* Main Content */}
        <main
          className={`w-full flex-1 flex flex-col ${
            isWorkspacePage
              ? "min-h-0 overflow-hidden px-0 py-0"
              : isTournamentPage
                ? "w-full px-0 py-0"
              : isDashboardPage
                ? "w-full px-4 sm:px-5 lg:px-6 xl:px-8 py-8"
                : "w-full px-4 sm:px-6 lg:px-8 xl:px-10 py-8"
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
    <div className="min-h-screen bg-theme-primary flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function App() {
  return (
    <>
      <ThemeController />
      <AuthChecker />
      <RealtimeBridge />
      <ActiveGameGuard />
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
              path="/play/practice/freeMove"
              element={
                <ProtectedRoute>
                  <PlayPractice />
                </ProtectedRoute>
              }
            />
            <Route
              path="/play/practice/positionBuilder"
              element={
                <ProtectedRoute>
                  <PlayPractice />
                </ProtectedRoute>
              }
            />
            <Route
              path="/play/practice/positionBuilder/freeMove"
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
                  <Navigate to="/puzzles/train?mode=rated" replace />
                </ProtectedRoute>
              }
            />
            <Route
              path="/puzzles/library"
              element={
                <ProtectedRoute>
                  <Puzzles />
                </ProtectedRoute>
              }
            />
            <Route
              path="/puzzles/history"
              element={
                <ProtectedRoute>
                  <PuzzleHistory />
                </ProtectedRoute>
              }
            />
            <Route
              path="/puzzles/random"
              element={
                <ProtectedRoute>
                  <Navigate to="/puzzles/train?mode=random" replace />
                </ProtectedRoute>
              }
            />
            <Route
              path="/puzzles/review"
              element={
                <ProtectedRoute>
                  <Navigate to="/puzzles/train?mode=review" replace />
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
              path="/learn/:courseSlug/:lessonSlug"
              element={
                <ProtectedRoute>
                  <LearnLesson />
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
              element={
                <ProtectedRoute>
                  <UserProfile />
                </ProtectedRoute>
              }
            />
            <Route
              path="/analyze/:gameId"
              element={
                <ProtectedRoute>
                  <Analyze />
                </ProtectedRoute>
              }
            />
            <Route
              path="/analyze960/:gameId"
              element={
                <ProtectedRoute>
                  <Analyze960 />
                </ProtectedRoute>
              }
            />

            {/* Admin routes - uses same login page, admin auth checked inside */}
            <Route path="/admin" element={<Navigate to="/admin/users" replace />} />
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="/admin/users/:userId" element={<AdminUserProfile />} />
            <Route path="/admin/puzzles" element={<AdminPuzzles />} />
            <Route path="/admin/bots" element={<AdminBots />} />
            <Route path="/admin/events" element={<AdminFeaturedEvents />} />
            <Route path="/admin/tournaments" element={<AdminTournaments />} />
            <Route path="/admin/games" element={<AdminGames />} />
            <Route path="/admin/community" element={<AdminCommunity />} />
            <Route path="/admin/groups" element={<AdminGroups />} />
            <Route path="/admin/learn" element={<AdminLearn />} />
            <Route
              path="/admin/learn/courses/:courseId"
              element={<AdminLearnCourse />}
            />
            <Route
              path="/admin/learn/courses/:courseId/lessons/:lessonId"
              element={<AdminLearnLesson />}
            />
            <Route path="/admin/profile" element={<AdminProfile />} />
            <Route path="/admin/analyze/:gameId" element={<AdminAnalyze />} />
          </Routes>
        </Suspense>
      </Layout>
      <FriendChallengeOverlay />
    </>
  );
}

export default App;


