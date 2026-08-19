import { z } from "zod";
import { phoneSchema } from "./common";

export const staffLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
export type StaffLoginInput = z.infer<typeof staffLoginSchema>;

export const customerRegisterSchema = z.object({
  name: z.string().trim().min(2).max(100),
  phone: phoneSchema,
  email: z.string().email(),
  password: z.string().min(8),
});
export type CustomerRegisterInput = z.infer<typeof customerRegisterSchema>;

export const customerLoginSchema = z.object({
  phone: phoneSchema,
  password: z.string().min(8),
});
export type CustomerLoginInput = z.infer<typeof customerLoginSchema>;

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(10),
});

// ---------- Email OTP (passwordless customer login/registration) ----------

export const requestEmailOtpSchema = z.object({
  email: z.string().trim().email(),
  purpose: z.enum(["LOGIN", "REGISTER"]),
});
export type RequestEmailOtpInput = z.infer<typeof requestEmailOtpSchema>;

export const verifyLoginOtpSchema = z.object({
  email: z.string().trim().email(),
  code: z.string().trim().length(6),
});
export type VerifyLoginOtpInput = z.infer<typeof verifyLoginOtpSchema>;

const genderSchema = z.enum(["MALE", "FEMALE", "OTHER"]);

export const verifyRegisterOtpSchema = z.object({
  email: z.string().trim().email(),
  code: z.string().trim().length(6),
  name: z.string().trim().min(2).max(100),
  phone: phoneSchema,
  gender: genderSchema.optional(),
  dob: z.coerce.date().optional(),
});
export type VerifyRegisterOtpInput = z.infer<typeof verifyRegisterOtpSchema>;
