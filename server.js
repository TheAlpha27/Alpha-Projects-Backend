const mongoose = require("mongoose");
const { User, Project } = require("./Models/schema");
const express = require("express");
require("dotenv").config();
const otpGenerator = require("otp-generator");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const bodyParser = require("body-parser");
const nodemailer = require("nodemailer");
const cors = require("cors");
const axios = require("axios");
const app = express();
const PORT = process.env.PORT || 4000;
app.use(express.json());

app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "https://alpha-projects-frontend.vercel.app",
    ],
    methods: ["POST", "OPTIONS", "GET", "PUT", "DELETE"],
    credentials: true,
  })
);

app.use(bodyParser.json());

const jwtSecret = process.env.JWT_SECRET;
const pepper = process.env.PEPPER;

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const db = mongoose.connection;
db.on("error", console.error.bind(console, "MongoDB connection error:"));
db.once("open", () => {
  console.log("Connected to MongoDB");
});

app.get("/", (req, res) => {
  res.json({ message: "Hello, World!" });
});

// Get Updated User
app.post("/getUpdatedUser", async (req, res) => {
  const { email } = req.body;
  try {
    const user = await User.findOne({ email });
    if (user) {
      if (user.status === "Inactive") {
        res.status(200).json({ error: true, message: "User is inactive" });
      } else {
        const token = jwt.sign({ email }, jwtSecret, { expiresIn: "1h" });
        res.status(200).json({ error: false, results: user, token });
      }
    } else {
      res.status(200).json({ error: true, message: "User not found" });
    }
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Get Projects
app.get("/getProjects", async (req, res) => {
  try {
    const projects = await Project.find();
    res.json(projects);
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Add New Project
app.post("/addProject", async (req, res) => {
  const {
    project_name,
    project_category,
    project_manager,
    client,
    country,
    city,
    contract_amount,
  } = req.body;

  // TODO - Lat/Lon logic and Check auth

  try {
    const response = await axios.get(
      `https://nominatim.openstreetmap.org/search?city=${city}&country=${country}&format=json`
    );
    if (response.data && response.data.length > 0) {
      lat = response.data[0].lat;
      lon = response.data[0].lon;
    } else {
      res.status(200).json({ error: true, message: "Invalid city or country" });
      return;
    }
  } catch (error) {
    res.status(200).json({ error: true, message: "Internal server error" });
    return;
  }

  const project = new Project({
    project_name,
    project_category,
    project_manager,
    client,
    country,
    city,
    latitude: lat,
    longitude: lon,
    contract_amount,
    date_added: new Date(),
  });

  try {
    await project.save();
    res.status(200).json({ error: false, message: "Project saved" });
  } catch (error) {
    console.error("Database error:", error);
    res.status(200).json({ error: true, message: "Internal server error" });
  }
});

// SignUp
app.post("/signup", async (req, res) => {
  const email = req.body.email;
  try {
    let user = await User.findOne({ email });
    if (user) {
      if (user.password) {
        return res
          .status(200)
          .json({ error: true, message: "Email already exists" });
      } else {
        const generatedOTP = otpGenerator.generate(6, {
          digits: true,
          upperCaseAlphabets: false,
          lowerCaseAlphabets: false,
          specialChars: false,
        });
        user.otp = generatedOTP;
        await user.save();

        const transporter = nodemailer.createTransport({
          service: "gmail",
          auth: {
            user: "utsav.soni.27@gmail.com",
            pass: process.env.NODEMAILER_PASS,
          },
        });
        const mailOptions = {
          from: "utsav.soni.27@gmail.com",
          to: email,
          subject: "OTP for Signup",
          text: `Your OTP for signup is: ${generatedOTP}`,
        };

        transporter.sendMail(mailOptions, (error, info) => {
          if (error) {
            console.error("Email sending error: " + error.stack);
            return res.status(500).json({ error: "Internal Server Error" });
          }
          console.log("Email sent: " + info.response);
          return res
            .status(200)
            .json({ error: false, message: "OTP sent succesfully" });
        });
      }
    } else {
      const generatedOTP = otpGenerator.generate(6, {
        digits: true,
        upperCaseAlphabets: false,
        lowerCaseAlphabets: false,
        specialChars: false,
      });
      user = new User({ email, otp: generatedOTP });
      await user.save();
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: "utsav.soni.27@gmail.com",
          pass: process.env.NODEMAILER_PASS,
        },
      });
      const mailOptions = {
        from: "utsav.soni.27@gmail.com",
        to: email,
        subject: "OTP for Signup",
        text: `Your OTP for signup is: ${generatedOTP}`,
      };

      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          console.error("Email sending error: " + error.stack);
          return res.status(500).json({ error: "Internal Server Error" });
        }
        console.log("Email sent: " + info.response);
        return res
          .status(200)
          .json({ error: false, message: "OTP sent succesfully" });
      });
    }
  } catch (error) {
    console.error("Database error: " + error.stack);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// Delete User
app.delete("/delete-users", async (req, res) => {
  const token = req.headers.authorization;
  if (!token) {
    return res.status(401).json({ error: "Unauthorized - No token provided" });
  }
  jwt.verify(token, jwtSecret, async (err, decoded) => {
    if (err) {
      return res.status(401).json({ error: "Unauthorized - Invalid token" });
    }
    const email = decoded.email;
    try {
      const user = await User.findOne({ email });
      if (user) {
        if (user.status === "Inactive") {
          return res
            .status(200)
            .json({ error: true, message: "User is inactive" });
        }
        if (user.type !== "Admin") {
          return res
            .status(200)
            .json({ error: true, message: "Action not allowed" });
        }
      } else {
        return res.status(200).json({ error: true, message: "User not found" });
      }
    } catch (error) {
      console.error("Database error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });
  try {
    const emails = req.body.userEmail;
    await User.deleteMany({ email: { $in: emails } });
    return res.json({ message: "Users deleted successfully." });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// Change User Type
app.put("/change-user-type", async (req, res) => {
  const token = req.headers.authorization;
  if (!token) {
    return res
      .status(200)
      .json({ error: true, message: "Unauthorized - No token provided" });
  }
  jwt.verify(token, jwtSecret, async (err, decoded) => {
    if (err) {
      return res.status(200).json({ error: true, message: "Invalid token" });
    }
    const email = decoded.email;
    try {
      const user = await User.findOne({ email });
      if (user) {
        if (user.status === "Inactive") {
          return res
            .status(200)
            .json({ error: true, message: "User is inactive" });
        }
        // TODO Update user type logic here
      } else {
        return res.status(200).json({ error: true, message: "User not found" });
      }
    } catch (error) {
      console.error("Database error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });
  // TODO Update user type in MongoDB
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
