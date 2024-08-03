const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  email: String,
  fullname: String,
  type: String,
  status: String,
  password: String,
  otp: String,
});

const projectSchema = new mongoose.Schema({
  project_name: String,
  project_category: String,
  project_manager: String,
  status: String,
  client: String,
  country: String,
  city: String,
  latitude: String,
  longitude: String,
  contract_amount: Number,
  date_added: Date,
});

const User = mongoose.model("User", userSchema);
const Project = mongoose.model("Project", projectSchema);

module.exports = { User, Project };
