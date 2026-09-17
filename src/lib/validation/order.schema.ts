import { z } from "zod";

/**
 * Validation schemas for Order queries and mutations.
 * Governance: PRD §6.6, §6.7, §6.8, security.md, validation-and-error-mapping/SKILL.md.
 */

export const orderQuerySchema = z.object({
  status: z.enum(["pending", "confirmed", "delivered", "cancelled"]).optional(),
  restaurantId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
});

export const createOrderItemSchema = z
  .object({
    menuItemId: z.string().uuid({ message: "menuItemId must be a valid UUID" }),
    quantity: z
      .number({ invalid_type_error: "quantity must be a number" })
      .int({ message: "quantity must be an integer" })
      .min(1, { message: "quantity must be at least 1" }),
  })
  .strict();

export const createOrderSchema = z
  .object({
    customerId: z.string().uuid({ message: "customerId must be a valid UUID" }),
    restaurantId: z.string().uuid({ message: "restaurantId must be a valid UUID" }),
    deliveryAddress: z
      .string()
      .min(5, { message: "deliveryAddress must be at least 5 characters" })
      .max(200, { message: "deliveryAddress cannot exceed 200 characters" }),
    items: z
      .array(createOrderItemSchema)
      .min(1, { message: "items must contain at least 1 item" })
      .max(50, { message: "items cannot contain more than 50 items" }),
  })
  .strict();

export const updateOrderSchema = z
  .object({
    status: z.enum(["pending", "confirmed", "delivered", "cancelled"]).optional(),
    deliveryAddress: z
      .string()
      .min(5, { message: "deliveryAddress must be at least 5 characters" })
      .max(200, { message: "deliveryAddress cannot exceed 200 characters" })
      .optional(),
  })
  .strict();
