import { z } from "zod";
import { wechatRecipeIds } from "../shared/wechat-themes.js";
export const wechatFormatSchema = z
  .object({
    recipe: z.enum(wechatRecipeIds).optional(),
    size: z
      .number()
      .refine((v) => [14, 15, 16, 17, 18, 20].includes(v), "请选择提供的字号")
      .optional(),
    lineHeight: z
      .number()
      .refine(
        (v) => [1.5, 1.6, 1.8, 1.85, 1.9, 2, 2.2].includes(v),
        "请选择提供的行距",
      )
      .optional(),
    indent: z.boolean().optional(),
    decorations: z.boolean().optional(),
  })
  .strict();
