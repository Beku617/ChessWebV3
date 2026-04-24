import mongoose from "mongoose";
import { History, History960 } from "../models/index.js";

const { ObjectId } = mongoose.Types;
const HISTORY_MODELS = [History, History960];

function normalizeObjectIds(ids = []) {
  return ids
    .map((id) => String(id || "").trim())
    .filter((id) => ObjectId.isValid(id))
    .map((id) => new ObjectId(id));
}

function mergeUserStats(target, stats) {
  const userId = String(stats?._id || "");
  if (!userId) return;

  const current =
    target.get(userId) || {
      gamesPlayed: 0,
      gamesWon: 0,
      gamesLost: 0,
      gamesDraw: 0,
    };

  current.gamesPlayed += Number(stats.gamesPlayed || 0);
  current.gamesWon += Number(stats.gamesWon || 0);
  current.gamesLost += Number(stats.gamesLost || 0);
  current.gamesDraw += Number(stats.gamesDraw || 0);
  target.set(userId, current);
}

export async function countGameHistories(query = {}) {
  const counts = await Promise.all(
    HISTORY_MODELS.map((model) => model.countDocuments(query)),
  );
  return counts.reduce((sum, count) => sum + count, 0);
}

export async function getGameHistoryStatsByUserIds(userIds = []) {
  const objectIds = normalizeObjectIds(userIds);
  const statsByUserId = new Map();

  if (objectIds.length === 0) {
    return statsByUserId;
  }

  const pipelines = HISTORY_MODELS.map((model) =>
    model.aggregate([
      { $match: { userId: { $in: objectIds } } },
      {
        $project: {
          userId: 1,
          gamesPlayed: { $literal: 1 },
          gamesWon: {
            $cond: [
              {
                $or: [
                  {
                    $and: [
                      { $eq: ["$playAs", "white"] },
                      { $eq: ["$result", "1-0"] },
                    ],
                  },
                  {
                    $and: [
                      { $eq: ["$playAs", "black"] },
                      { $eq: ["$result", "0-1"] },
                    ],
                  },
                ],
              },
              1,
              0,
            ],
          },
          gamesLost: {
            $cond: [
              {
                $or: [
                  {
                    $and: [
                      { $eq: ["$playAs", "white"] },
                      { $eq: ["$result", "0-1"] },
                    ],
                  },
                  {
                    $and: [
                      { $eq: ["$playAs", "black"] },
                      { $eq: ["$result", "1-0"] },
                    ],
                  },
                ],
              },
              1,
              0,
            ],
          },
          gamesDraw: {
            $cond: [{ $eq: ["$result", "1/2-1/2"] }, 1, 0],
          },
        },
      },
      {
        $group: {
          _id: "$userId",
          gamesPlayed: { $sum: "$gamesPlayed" },
          gamesWon: { $sum: "$gamesWon" },
          gamesLost: { $sum: "$gamesLost" },
          gamesDraw: { $sum: "$gamesDraw" },
        },
      },
    ]),
  );

  const results = await Promise.all(pipelines);
  results.flat().forEach((stats) => mergeUserStats(statsByUserId, stats));

  return statsByUserId;
}
