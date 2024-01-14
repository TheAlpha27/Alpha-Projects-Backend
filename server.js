const express = require("express");
const mysql = require("mysql");
require("dotenv").config();
const otpGenerator = require("otp-generator");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const bodyParser = require("body-parser");
const nodemailer = require("nodemailer");
const cors = require("cors");
const axios = require("axios");
const moment = require("moment");
const app = express();
const PORT = process.env.PORT || 4000;
app.use(express.json());

app.use(
  cors({
    origin: ["http://localhost:3000", "https://alpha-projects-frontend.vercel.app"],
    methods: ["POST", "OPTIONS", "GET", "PUT", "DELETE"],
    credentials: true,
  })
);

app.use(bodyParser.json());

const jwtSecret = process.env.JWT_SECRET;
const pepper = process.env.PEPPER;

const dbConfig = {
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USERNAME,
  password: process.env.MYSQL_PASSWORD,
  database: "sql12675927",
};

const connection = mysql.createConnection(dbConfig);

connection.connect((err) => {
  if (err) {
    console.error("Database connection failed: ", err);
  } else {
    console.log("Connected to the database");
  }
});

app.get("/", (req, res) => {
  res.json({ message: "Hello, World!" });
});

app.post("/getUpdatedUser", async (req, res) => {
  const { email } = req.body;
  let query = `Select type, status From users where email = (?)`;
  try {
    connection.query(query, [email], (error, results) => {
      if (error) {
        console.error("Database error:", error);
        res.status(500).json({ message: "Internal server error" });
      } else {
        if (results.length > 0) {
          if (results[0].status == "Inactive") {
            res.status(200).json({ error: true, message: "User is inactive" });
          } else {
            const token = jwt.sign({ email }, jwtSecret, {
              expiresIn: "1h",
            });
            res.status(200).json({ error: false, results, token });
          }
        } else {
          res.status(200).json({ error: true, message: "User not found" });
        }
      }
    });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.get("/getProjects", async (req, res) => {
  let query = "SELECT * FROM projects ";

  try {
    connection.query(query, (error, results) => {
      if (error) {
        console.error("Database error:", error);
        res.status(500).json({ message: "Internal server error" });
      } else {
        res.json(results);
      }
    });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

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
  let lat;
  let lon;
  const token = req.headers.authorization;
  if (!token) {
    return res.status(401).json({ error: "Unauthorized - No token provided" });
  }
  jwt.verify(token, jwtSecret, (err, decoded) => {
    if (err) {
      return res.status(401).json({ error: "Unauthorized - Invalid token" });
    }
    const email = decoded.email;
    let query = `Select type, status From users where email = (?)`;
    try {
      connection.query(query, [email], (error, results) => {
        if (error) {
          console.error("Database error:", error);
          res.status(500).json({ message: "Internal server error" });
        } else {
          if (results.length > 0) {
            if (results[0].status == "Inactive") {
              return res
                .status(200)
                .json({ error: true, message: "User is inactive" });
            }
            if (results[0].type == "Guest") {
              return res
                .status(200)
                .json({ error: true, message: "Action not allowed" });
            }
          } else {
            return res
              .status(200)
              .json({ error: true, message: "User not found" });
          }
        }
      });
    } catch (error) {
      console.error("Database error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
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

  let date = new Date();

  const query =
    "INSERT INTO projects (project_name, project_category, project_manager, client, country, city, latitude, longitude, contract_amount, date_added) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
  const values = [
    project_name,
    project_category,
    project_manager,
    client,
    country,
    city,
    lat,
    lon,
    contract_amount,
    date,
  ];

  try {
    connection.query(query, values, (error, results) => {
      if (error) {
        console.error("Database error:", error);
        res.status(200).json({ error: true, message: "Internal server error" });
      } else {
        res.status(200).json({ error: false, message: "Project saved" });
      }
    });
  } catch (error) {
    console.error("Database error:", error);
    res.status(200).json({ error: true, message: "Internal server error" });
  }
});

app.post("/signup", async (req, res) => {
  const email = req.body.email;
  const checkEmailQuery = `SELECT * FROM users WHERE email = ?`;
  connection.query(checkEmailQuery, [email], (error, results) => {
    if (error) {
      console.error("Database error: " + error.stack);
      return res.status(500).json({ error: "Internal Server Error" });
    }
    if (results.length > 0) {
      if (results[0].password) {
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
        const saveUserQuery = "UPDATE users SET otp = ? WHERE email = ?";
        connection.query(saveUserQuery, [generatedOTP, email], (error) => {
          if (error) {
            console.error("Database error: " + error.stack);
            return res.status(500).json({ error: "Internal Server Error" });
          }
          const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
              user: "utsav.soni.27@gmail.com",
              pass: "tbsi luzq wnqd xigd",
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
        });
      }
    } else {
      const generatedOTP = otpGenerator.generate(6, {
        digits: true,
        upperCaseAlphabets: false,
        lowerCaseAlphabets: false,
        specialChars: false,
      });
      const saveUserQuery = `INSERT INTO users (email, otp) VALUES (?, ?)`;
      connection.query(saveUserQuery, [email, generatedOTP], (error) => {
        if (error) {
          console.error("Database error: " + error.stack);
          return res.status(500).json({ error: "Internal Server Error" });
        }
        const transporter = nodemailer.createTransport({
          service: "gmail",
          auth: {
            user: "utsav.soni.27@gmail.com",
            pass: "tbsi luzq wnqd xigd",
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
      });
    }
  });
});

app.delete("/delete-users", (req, res) => {
  const token = req.headers.authorization;
  if (!token) {
    return res.status(401).json({ error: "Unauthorized - No token provided" });
  }
  jwt.verify(token, jwtSecret, (err, decoded) => {
    if (err) {
      return res.status(401).json({ error: "Unauthorized - Invalid token" });
    }
    const email = decoded.email;
    let query = `Select type, status From users where email = (?)`;
    try {
      connection.query(query, [email], (error, results) => {
        if (error) {
          console.error("Database error:", error);
          res.status(500).json({ message: "Internal server error" });
        } else {
          if (results.length > 0) {
            if (results[0].status == "Inactive") {
              return res
                .status(200)
                .json({ error: true, message: "User is inactive" });
            }
            if (results[0].type != "Admin") {
              return res
                .status(200)
                .json({ error: true, message: "Action not allowed" });
            }
          } else {
            return res
              .status(200)
              .json({ error: true, message: "User not found" });
          }
        }
      });
    } catch (error) {
      console.error("Database error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
  try {
    const emails = req.body.userEmail;
    connection.query(
      "DELETE FROM users WHERE email IN (?)",
      [emails],
      (error, results) => {
        if (error) {
          console.error("Database error:", error);
          return res.status(500).json({ error: "Internal Server Error" });
        }
        return res.json({ message: "Users deleted successfully." });
      }
    );
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

app.put("/change-user-type", (req, res) => {
  const token = req.headers.authorization;
  if (!token) {
    return res.status(401).json({ error: "Unauthorized - No token provided" });
  }
  jwt.verify(token, jwtSecret, (err, decoded) => {
    if (err) {
      return res.status(401).json({ error: "Unauthorized - Invalid token" });
    }
    const email = decoded.email;
    let query = `Select type, status From users where email = (?)`;
    try {
      connection.query(query, [email], (error, results) => {
        if (error) {
          console.error("Database error:", error);
          res.status(500).json({ message: "Internal server error" });
        } else {
          if (results.length > 0) {
            if (results[0].status == "Inactive") {
              return res
                .status(200)
                .json({ error: true, message: "User is inactive" });
            }
            if (results[0].type != "Admin") {
              return res
                .status(200)
                .json({ error: true, message: "Action not allowed" });
            }
          } else {
            return res
              .status(200)
              .json({ error: true, message: "User not found" });
          }
        }
      });
    } catch (error) {
      console.error("Database error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
  try {
    const userUpdates = req.body.userUpdates;
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
          error:
            'Invalid input in array. Each object should have "email" and "type" properties.',
        });
      }

      connection.query(
        "UPDATE users SET `type` = ? WHERE `email` = ?",
        [userType, userEmail],
        (error, results) => {
          if (error) {
            console.error("Database error:", error);
            return res.status(500).json({ error: "Internal Server Error" });
          }
        }
      );
    }

    return res.status(200).json({ message: "User types updated." });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

app.put("/change-user-status", (req, res) => {
  const token = req.headers.authorization;
  if (!token) {
    return res.status(401).json({ error: "Unauthorized - No token provided" });
  }
  jwt.verify(token, jwtSecret, (err, decoded) => {
    if (err) {
      return res.status(401).json({ error: "Unauthorized - Invalid token" });
    }
    const email = decoded.email;
    let query = `Select type, status From users where email = (?)`;
    try {
      connection.query(query, [email], (error, results) => {
        if (error) {
          console.error("Database error:", error);
          res.status(500).json({ message: "Internal server error" });
        } else {
          if (results.length > 0) {
            if (results[0].status == "Inactive") {
              return res
                .status(200)
                .json({ error: true, message: "User is inactive" });
            }
            if (results[0].type != "Admin") {
              return res
                .status(200)
                .json({ error: true, message: "Action not allowed" });
            }
          } else {
            return res
              .status(200)
              .json({ error: true, message: "User not found" });
          }
        }
      });
    } catch (error) {
      console.error("Database error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
  try {
    const userUpdates = req.body.userUpdates;
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
          error:
            'Invalid input in array. Each object should have "email" and "Status" properties.',
        });
      }

      connection.query(
        "UPDATE users SET `status` = ? WHERE `email` = ?",
        [userStatus, userEmail],
        (error, results) => {
          if (error) {
            console.error("Database error:", error);
            return res.status(500).json({ error: "Internal Server Error" });
          }
        }
      );
    }

    return res.status(200).json({ message: "User Status updated." });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get("/get-users", (req, res) => {
  const token = req.headers.authorization;
  if (!token) {
    return res.status(401).json({ error: "Unauthorized - No token provided" });
  }
  jwt.verify(token, jwtSecret, (err, decoded) => {
    if (err) {
      return res.status(401).json({ error: "Unauthorized - Invalid token" });
    }
    const email = decoded.email;
    let query = `Select type, status From users where email = (?)`;
    try {
      connection.query(query, [email], (error, results) => {
        if (error) {
          console.error("Database error:", error);
          res.status(500).json({ message: "Internal server error" });
        } else {
          if (results.length > 0) {
            if (results[0].status == "Inactive") {
              return res
                .status(401)
                .json({ error: true, message: "User is inactive" });
            }
            if (results[0].type == "Guest") {
              return res
                .status(401)
                .json({ error: true, message: "Action not allowed" });
            }
          } else {
            return res
              .status(401)
              .json({ error: true, message: "User not found" });
          }
        }
      });
    } catch (error) {
      console.error("Database error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
  try {
    connection.query(
      "SELECT `email`, `type`, `status`, `fullname` FROM `users`",
      (error, results) => {
        if (error) {
          console.error("Database error:", error);
          res.status(500).json({ message: "Internal server error" });
        } else {
          res.status(200).json(results);
        }
      }
    );
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.post("/verify-otp", (req, res) => {
  const email = req.body.email;
  const userEnteredOTP = req.body.otp;
  const checkOTPQuery = `SELECT * FROM users WHERE email = ? AND otp = ?`;
  connection.query(checkOTPQuery, [email, userEnteredOTP], (error, results) => {
    if (error) {
      console.error("Database error: " + error.stack);
      return res.status(500).json({ error: "Internal Server Error" });
    }

    if (results.length > 0) {
      const deleteOTPQuery = `UPDATE users SET otp = NULL WHERE email = ?`;
      connection.query(deleteOTPQuery, [email], (error) => {
        if (error) {
          console.error("Database error: " + error.stack);
          return res.status(500).json({ error: "Internal Server Error" });
        }
        return res
          .status(200)
          .json({ error: false, message: "OTP verified successfully" });
      });
    } else {
      res.status(200).json({ error: true, message: "Invalid OTP" });
    }
  });
});

app.post("/createPassword", async (req, res) => {
  const email = req.body.email;
  const password = req.body.password;
  const fullname = req.body.fullname;
  const checkUserQuery =
    "SELECT * FROM users WHERE email = ? AND password IS NULL";
  connection.query(checkUserQuery, [email], async (error, results) => {
    if (error) {
      console.error("Database error: " + error.stack);
      return res.status(500).json({ error: "Internal Server Error" });
    }
    if (results.length > 0) {
      const saltRounds = 10;
      const pepper = process.env.PEPPER;

      const hashedPassword = await bcrypt.hash(password + pepper, saltRounds);

      const updatePasswordQuery =
        "UPDATE users SET password = ?, fullname = ? WHERE email = ?";
      connection.query(
        updatePasswordQuery,
        [hashedPassword, fullname, email],
        (updateError, updateResults) => {
          if (updateError) {
            console.error("Database error: " + updateError.stack);
            return res.status(500).json({ error: "Internal Server Error" });
          }

          const token = jwt.sign({ email }, jwtSecret, { expiresIn: "1h" });

          return res.status(200).json({
            error: false,
            message: "Password created successfully",
            token,
            userType: results[0].type,
            email,
          });
        }
      );
    } else {
      return res
        .status(200)
        .json({ error: true, message: "Invalid user or OTP already used" });
    }
  });
});

app.post("/login", (req, res) => {
  const email = req.body.email;
  const password = req.body.password;

  const checkLoginQuery = "SELECT * FROM users WHERE email = ?";
  connection.query(checkLoginQuery, [email], async (error, results) => {
    if (error) {
      console.error("Database error: " + error.stack);
      return res.status(500).json({ error: "Internal Server Error" });
    }

    if (results.length > 0) {
      const user = results[0];
      if(user.status == 'Inactive'){
        return res.status(200).json({error: true, message: 'User is Inactive'});
      }
      const isMatch = await bcrypt.compare(password + pepper, user.password);
      if (isMatch) {
        const token = jwt.sign({ email }, jwtSecret, {
          expiresIn: "1h",
        });

        return res.status(200).json({
          error: false,
          message: "Login successful",
          token,
          userType: user.type,
          email,
          fullname: user.fullname,
        });
      } else {
        return res
          .status(200)
          .json({ error: true, message: "Invalid email or password" });
      }
    } else {
      return res
        .status(200)
        .json({ error: true, message: "Invalid email or password" });
    }
  });
});

app.post("/forgotPassword", (req, res) => {
  const email = req.body.email;

  const checkUserQuery =
    'SELECT * FROM users WHERE email = ? AND password IS NOT NULL AND password != ""';
  connection.query(checkUserQuery, [email], async (error, results) => {
    if (error) {
      console.error("Database error: " + error.stack);
      return res.status(500).json({ error: "Internal Server Error" });
    }

    if (results.length > 0) {
      const generatedOTP = otpGenerator.generate(6, {
        digits: true,
        upperCaseAlphabets: false,
        lowerCaseAlphabets: false,
        specialChars: false,
      });
      const saveOTPQuery = "UPDATE users SET otp = ? WHERE email = ?";
      connection.query(saveOTPQuery, [generatedOTP, email], (otpError) => {
        if (otpError) {
          console.error("Database error: " + otpError.stack);
          return res.status(500).json({ error: "Internal Server Error" });
        }

        const transporter = nodemailer.createTransport({
          service: "gmail",
          auth: {
            user: "utsav.soni.27@gmail.com",
            pass: "tbsi luzq wnqd xigd",
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

          return res
            .status(200)
            .json({ error: false, message: "OTP sent for password reset" });
        });
      });
    } else {
      return res.status(200).json({
        error: true,
        message: "Invalid user or password reset not allowed",
      });
    }
  });
});

app.post("/resetPassword", async (req, res) => {
  const email = req.body.email;
  const password = req.body.password;

  const saltRounds = 10;

  const hashedPassword = await bcrypt.hash(password + pepper, saltRounds);

  const updatePasswordQuery = "UPDATE users SET password = ? WHERE email = ?";
  connection.query(
    updatePasswordQuery,
    [hashedPassword, email],
    (error, results) => {
      if (error) {
        console.error("Database error: " + error.stack);
        return res.status(500).json({ error: "Internal Server Error" });
      }

      return res.status(200).json({
        error: false,
        message: "Password reset successful",
        email,
      });
    }
  );
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
