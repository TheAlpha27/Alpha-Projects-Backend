const jwt = require("jsonwebtoken");
const { User } = require("../Models/schema");
const { UserStatus, UserTypes } = require("../constants");

const protectRoute =
  (requiredUserType = undefined) =>
  async (req, res, next) => {
    const token = req.headers.authorization;
    if (!token) {
      return res
        .status(401)
        .json({ error: "Unauthorized - No token provided" });
    }

    jwt.verify(token, jwtSecret, async (err, decoded) => {
      if (err) {
        return res.status(401).json({ error: "Unauthorized - Invalid token" });
      }

      const email = decoded.email;
      try {
        const user = await User.findOne({ email });
        if (!user) {
          return res.status(401).json({ message: "User not found" });
        }

        if (user.status === UserStatus.inactive) {
          return res.status(401).json({ message: "User is inactive" });
        }

        if (requiredUserType) {
          if (
            requiredUserType === UserTypes.admin &&
            user.type !== UserTypes.admin
          ) {
            return res.status(403).json({ message: "Action not allowed" });
          }
          if (
            requiredUserType === UserTypes.user &&
            user.type === UserTypes.guest
          ) {
            return res.status(403).json({ message: "Action not allowed" });
          }
        }
        
        req.user = user;
        next();
      } catch (error) {
        if (error.name === "JsonWebTokenError") {
          return res.status(401).json({ message: "Invalid token" });
        }
        console.error("Database error:", error);
        return res.status(500).json({ message: "Internal server error" });
      }
    });
  };

module.exports = protectRoute;
