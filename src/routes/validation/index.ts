import { check } from "express-validator";
import { ValidPasswordLength } from "../../data";

export const validateRegister = [
  check("email").isEmail().withMessage("Invalid email"),
  check("password")
    .isLength({ min: ValidPasswordLength })
    .withMessage(
      `Password must be at least ${ValidPasswordLength} characters long`
    ),
  check("name").optional().isString().withMessage("Name must be a string"),
];

export const validateLogin = [
  check("email").isEmail().withMessage("Invalid email"),
  check("password")
    .isString()
    .withMessage("Password must be a string")
    .isLength({ min: ValidPasswordLength })
    .withMessage(
      `Password must be at least ${ValidPasswordLength} characters long`
    ),
];

export const validateCreateRoom = [
  check("name")
    .isString()
    .withMessage("Name must be a string")
    .isLength({ min: 1 })
    .withMessage("Name is required"),
  check("isPrivate")
    .optional()
    .isBoolean()
    .withMessage("Is private must be a boolean"),
];

export const validateJoinRoom = [
  check("roomId")
    .optional()
    .isString()
    .withMessage("Room ID must be a string")
    .isLength({ min: 1 })
    .withMessage("Room ID is required"),
  check("inviteCode")
    .optional()
    .isString()
    .withMessage("Invite code must be a string"),
];
