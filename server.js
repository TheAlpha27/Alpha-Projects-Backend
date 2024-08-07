const mongoose = require("mongoose");
const { User, Project } = require("./Models/schema");
const { UserStatus, UserTypes, ProjectStatus } = require("./constants");
const express = require("express");
require("dotenv").config();
const otpGenerator = require("otp-generator");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const bodyParser = require("body-parser");
const nodemailer = require("nodemailer");
const cors = require("cors");
const axios = require("axios");
const protectRoute = require("./middleware/protectRoute");
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

/****************    AUTH    ****************/

// SignUp
app.post("/signup", async (req, res) => {
  const email = req.body.email;
  try {
    let user = await User.findOne({ email });
    if (user) {
      if (user.password) {
        return res.status(400).json({ message: "Email already exists" });
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
          return res.status(200).json({ message: "OTP sent succesfully" });
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
        return res.status(200).json({ message: "OTP sent succesfully" });
      });
    }
  } catch (error) {
    console.error("Database error: " + error.stack);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// Verify OTP
app.post("/verify-otp", async (req, res) => {
  const { email, otp } = req.body;

  try {
    const user = await User.findOne({ email, otp });
    if (!user) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    user.otp = null;
    await user.save();

    return res.status(200).json({ message: "OTP verified successfully" });
  } catch (error) {
    console.error("Database error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// Create Password
app.post("/createPassword", async (req, res) => {
  const { email, password, fullname } = req.body;

  try {
    const user = await User.findOne({ email, password: null });
    if (!user) {
      return res
        .status(400)
        .json({ message: "Invalid user or OTP already used" });
    }

    const saltRounds = 10;
    const pepper = process.env.PEPPER;

    const hashedPassword = await bcrypt.hash(password + pepper, saltRounds);

    user.password = hashedPassword;
    user.fullname = fullname;
    user.type = UserTypes.user;
    user.status = UserStatus.active;

    await user.save();

    const token = jwt.sign({ email: user.email }, jwtSecret, {
      expiresIn: "1h",
    });

    return res.status(200).json({
      message: "Password created successfully",
      token,
      type: user.type,
      email: user.email,
      fullname: user.fullname,
    });
  } catch (error) {
    console.error("Database error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// Login
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    console.log("login: ", { user });

    if (user.status === UserStatus.inactive) {
      return res.status(401).json({ message: "User is Inactive" });
    }

    const isMatch = await bcrypt.compare(password + pepper, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    const token = jwt.sign({ email: user.email }, jwtSecret, {
      expiresIn: "1h",
    });

    return res.status(200).json({
      message: "Login successful",
      user: {
        token,
        _id: user._id,
        type: user.type,
        email: user.email,
        fullname: user.fullname,
      },
    });
  } catch (error) {
    console.error("Database error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// Forgot Password
app.post("/forgotPassword", async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({
      email,
      password: { $ne: null, $ne: "" },
    });
    if (!user) {
      return res.status(400).json({
        message: "Invalid user or password reset not allowed",
      });
    }

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
      subject: "OTP for Password Reset",
      text: `Your OTP for password reset is: ${generatedOTP}`,
    };

    transporter.sendMail(mailOptions, (emailError, info) => {
      if (emailError) {
        console.error("Email sending error: " + emailError.stack);
        return res.status(500).json({ error: "Internal Server Error" });
      }
      console.log("Email sent: " + info.response);

      return res.status(200).json({ message: "OTP sent for password reset" });
    });
  } catch (error) {
    console.error("Database error: " + error.stack);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// Reset Password
app.post("/resetPassword", async (req, res) => {
  const { email, password } = req.body;
  const saltRounds = 10;
  const pepper = process.env.PEPPER;

  try {
    const hashedPassword = await bcrypt.hash(password + pepper, saltRounds);

    const result = await User.updateOne(
      { email },
      { $set: { password: hashedPassword } }
    );

    if (result.nModified === 0) {
      return res.status(400).json({
        message: "User not found or password reset failed",
      });
    }

    return res.status(200).json({
      message: "Password reset successful",
      email,
    });
  } catch (error) {
    console.error("Database error: " + error.stack);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

/****************    USERS    ****************/

// Get Users
app.get("/get-users", protectRoute(UserTypes.user), async (req, res) => {
  try {
    const users = await User.find({}, "email type status fullname");
    return res.status(200).json(users);
  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// Get Updated User
app.post("/getUpdatedUser", protectRoute(), async (req, res) => {
  const user = req.user;
  if (user) {
    const token = jwt.sign({ email: user.email }, jwtSecret, {
      expiresIn: "1h",
    });
    res.status(200).json({
      email: user.email,
      fullname: user.fullname,
      status: user.status,
      type: user.type,
      token,
    });
  } else {
    res.status(401).json({ message: "User not found" });
  }
});

// Delete User
app.post("/delete-users", protectRoute(UserTypes.admin), async (req, res) => {
  try {
    const emails = req.body;
    await User.deleteMany({ email: { $in: emails } });
    return res.json({ message: "Users deleted successfully." });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// Change User Type
app.put(
  "/change-user-type",
  protectRoute(UserTypes.admin),
  async (req, res) => {
    try {
      const userUpdates = req.body.userUpdates;
      if (!Array.isArray(userUpdates)) {
        return res.status(400).json({
          message: "Invalid input format. userUpdates should be an array.",
        });
      }

      for (const update of userUpdates) {
        const userEmail = update.email;
        const userType = update.type;
        if (
          !userEmail ||
          !userType ||
          typeof userEmail !== "string" ||
          typeof userType !== "string"
        ) {
          return res.status(400).json({
            message:
              'Invalid input in array. Each object should have "email" and "type" properties.',
          });
        }

        const updatedUser = await User.findOneAndUpdate(
          { email: userEmail },
          { type: userType },
          { new: true }
        );

        if (!updatedUser) {
          return res
            .status(400)
            .json({ message: `User not found: ${userEmail}` });
        }
      }

      return res.status(200).json({ message: "Action completed" });
    } catch (error) {
      console.error("Error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

// Change User Status
app.put(
  "/change-user-status",
  protectRoute(UserTypes.admin),
  async (req, res) => {
    try {
      const userUpdates = req.body.userUpdates;
      if (!Array.isArray(userUpdates)) {
        return res.status(400).json({
          message: "Invalid input format. userUpdates should be an array.",
        });
      }

      for (const update of userUpdates) {
        const userEmail = update.email;
        const userStatus = update.status;
        if (
          !userEmail ||
          !userStatus ||
          typeof userEmail !== "string" ||
          typeof userStatus !== "string"
        ) {
          return res.status(400).json({
            message:
              'Invalid input in array. Each object should have "email" and "status" properties.',
          });
        }

        const updatedUser = await User.findOneAndUpdate(
          { email: userEmail },
          { status: userStatus },
          { new: true }
        );

        if (!updatedUser) {
          return res
            .status(400)
            .json({ message: `User not found: ${userEmail}` });
        }
      }

      return res.status(200).json({ message: "Action completed" });
    } catch (error) {
      console.error("Error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

/****************    PROJECTS    ****************/

// Get Projects
app.get("/getProjects", protectRoute(), async (req, res) => {
  try {
    const projects = await Project.find();
    res.json(projects);
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Add New Project
app.post("/addProject", protectRoute(UserTypes.user), async (req, res) => {
  const {
    project_name,
    project_category,
    project_manager,
    status,
    client,
    country,
    city,
    contract_amount,
  } = req.body;

  try {
    const response = await axios.get(
      `https://geocode.maps.co/search?q=${city},${country}&api_key=${process.env.API_KEY}`
    );

    let lat, lon;
    if (response.data && response.data.length > 0) {
      lat = response.data[0].lat;
      lon = response.data[0].lon;
    } else {
      return res.status(400).json({ message: "Invalid city or country" });
    }

    const project = new Project({
      project_name,
      project_category,
      project_manager,
      status: status ?? ProjectStatus.notStarted,
      client,
      country,
      city,
      latitude: lat,
      longitude: lon,
      contract_amount,
      date_added: new Date(),
    });

    await project.save();
    res.status(200).json({ message: "Project saved" });
  } catch (error) {
    console.log("Error:", { error });
    if (error.code === 11000) {
      res.status(500).json({ message: "Project name must be unique" });
    }
    res.status(500).json({ message: "Internal server error" });
  }
});

// Update Project
app.put("/updateProject", protectRoute(UserTypes.admin), async (req, res) => {
  const {
    project_name,
    project_category,
    project_manager,
    status,
    client,
    country,
    city,
    contract_amount,
    latitude,
    longitude,
    _id,
  } = req.body;

  try {
    const existingProject = await Project.findById(_id);
    if (!existingProject) {
      return res.status(404).json({ message: "Project not found" });
    }

    let lat = latitude;
    let lon = longitude;

    if (existingProject.city !== city || existingProject.country !== country) {
      const response = await axios.get(
        `https://nominatim.openstreetmap.org/search?city=${city}&country=${country}&format=json`
      );

      if (response.data && response.data.length > 0) {
        lat = response.data[0].lat;
        lon = response.data[0].lon;
      } else {
        return res.status(400).json({ message: "Invalid city or country" });
      }
    }

    existingProject.project_name = project_name ?? existingProject.project_name;
    existingProject.project_category =
      project_category ?? existingProject.project_category;
    existingProject.project_manager =
      project_manager ?? existingProject.project_manager;
    existingProject.status = status ?? existingProject.status;
    existingProject.client = client ?? existingProject.client;
    existingProject.country = country ?? existingProject.country;
    existingProject.city = city ?? existingProject.city;
    existingProject.latitude = lat;
    existingProject.longitude = lon;
    existingProject.contract_amount =
      contract_amount ?? existingProject.contract_amount;
    existingProject.date_added = existingProject.date_added;

    await existingProject.save();
    res.status(200).json({ message: "Project updated" });
  } catch (error) {
    console.log("Error:", { error });
    if (error.code === 11000) {
      res.status(500).json({ message: "Project name must be unique" });
    }
    res.status(500).json({ message: "Internal server error" });
  }
});

// Delete Project
app.delete(
  "/deleteProject/:id",
  protectRoute(UserTypes.admin),
  async (req, res) => {
    try {
      const project = await Project.findById(req.params.id);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      await Project.deleteOne({ _id: req.params.id });
      res.status(200).json({ error: false, message: "Project deleted" });
    } catch (error) {
      console.log("Error:", { error });
      res.status(500).json({ error: true, message: "Internal server error" });
    }
  }
);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
