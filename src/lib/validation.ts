import { z } from "zod";

// Login validation schema
export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .email("Invalid email address")
    .max(255, "Email must be less than 255 characters"),
  password: z
    .string()
    .min(10, "Password must be at least 10 characters")
    .max(128, "Password must be less than 128 characters"),
});

// User creation validation schema
export const createUserSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .email("Invalid email address")
    .max(255, "Email must be less than 255 characters"),
  password: z
    .string()
    .min(10, "Password must be at least 10 characters")
    .max(128, "Password must be less than 128 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
  fullName: z
    .string()
    .trim()
    .max(100, "Name must be less than 100 characters")
    .optional(),
  role: z.enum(['dispatch', 'afterhours', 'admin', 'manager', 'driver', 'safety', 'supervisor', 'accounting', 'maintenance', 'chicago_management', 'yard', 'recruiting'], {
    errorMap: () => ({ message: "Invalid role selected" }),
  }),
});

export type LoginFormData = z.infer<typeof loginSchema>;
export type CreateUserFormData = z.infer<typeof createUserSchema>;
