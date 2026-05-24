import {
  adminBotsRoutes,
  adminEventsMnRoutes,
  adminEventsRoutes,
  adminCommunityRoutes,
  adminFeaturedEventsRoutes,
  adminGamesRoutes,
  adminGroupsRoutes,
  adminPuzzlesRoutes,
  adminRoutes,
  adminUsersRoutes,
  analysisAiRoutes,
  authRoutes,
  botsRoutes,
  communityRoutes,
  eventsMnRoutes,
  eventsRoutes,
  featuredEventsRoutes,
  friendsRoutes,
  gameConfigRoutes,
  historyRoutes,
  lichessRoutes,
  mediaRoutes,
  messagesRoutes,
  learnRoutes,
  learnMnRoutes,
  adminLearnRoutes,
  adminLearnMnRoutes,
  puzzleRoutes,
  ratingsRoutes,
  pgnRoutes,
  tournamentRoutes,
} from "../routes/index.js";

function registerApiRoutes(app) {
  app.use("/api", authRoutes);
  app.use("/api/history", historyRoutes);
  app.use("/api/puzzles", puzzleRoutes);
  app.use("/api/game-config", gameConfigRoutes);
  app.use("/api/bots", botsRoutes);
  app.use("/api/pgn", pgnRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/admin/users", adminUsersRoutes);
  app.use("/api/admin/games", adminGamesRoutes);
  app.use("/api/admin/puzzles", adminPuzzlesRoutes);
  app.use("/api/admin/bots", adminBotsRoutes);
  app.use("/api/admin/events", adminEventsRoutes);
  app.use("/api/admin/events-mn", adminEventsMnRoutes);
  app.use("/api/admin/featured-events", adminFeaturedEventsRoutes);
  app.use("/api/media", mediaRoutes);
  app.use("/api/community", communityRoutes);
  app.use("/api/admin/community", adminCommunityRoutes);
  app.use("/api/admin/groups", adminGroupsRoutes);
  app.use("/api/events", eventsRoutes);
  app.use("/api/events-mn", eventsMnRoutes);
  app.use("/api/featured-events", featuredEventsRoutes);
  app.use("/api/lichess", lichessRoutes);
  app.use("/api/friends", friendsRoutes);
  app.use("/api/ratings", ratingsRoutes);
  app.use("/api/tournaments", tournamentRoutes);
  app.use("/api/messages", messagesRoutes);
  app.use("/api/learn", learnRoutes);
  app.use("/api/learn-mn", learnMnRoutes);
  app.use("/api/admin/learn", adminLearnRoutes);
  app.use("/api/admin/learn-mn", adminLearnMnRoutes);
  app.use("/api/ai", analysisAiRoutes);
}

export { registerApiRoutes };
