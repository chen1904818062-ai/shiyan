import { api, context, json, runtime } from "@/lib/server";
import { resolveModelConfig, ModelConfigurationError } from "@/lib/model-config";
import { ApiError } from "@/lib/server";

export const GET = api(async () => {
  await context(); const config = runtime();
  if (!config.MODEL_API_KEY?.trim()) return json({ configured: false, model: "deepseek-flash" });
  try {
    const resolved = resolveModelConfig({}, config);
    return json({ configured: true, model: resolved.model, provider: resolved.provider });
  } catch (error) {
    if (error instanceof ModelConfigurationError) throw new ApiError(error.message, error.status);
    throw error;
  }
});
