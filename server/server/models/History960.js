import mongoose from "mongoose";
import History from "./History.js";

// Same schema as standard history, stored in a separate collection for Chess960.
const History960Schema = History.schema.clone();

const History960 =
  mongoose.models.History960 ||
  mongoose.model("History960", History960Schema, "history960");

export default History960;
