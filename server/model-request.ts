// Provider compatibility and safe diagnostic categories; never include provider text in UI.
export function validateToolMode(body: any) {
  if (
    body.thinking?.type === "enabled" &&
    (body.tool_choice === "required" ||
      (body.tool_choice && typeof body.tool_choice === "object"))
  )
    throw Object.assign(
      new Error("当前步骤的工具调用方式与思考模式不兼容，请重新规划任务"),
      { code: "MODEL_TOOL_MODE_INVALID", statusCode: 422 },
    );
}
export function invalidRequest(error: any) {
  const detail = String(error?.message || ""),
    param = String(error?.param || "");
  if (
    param === "tool_choice" ||
    /tool_choice|forced.*tool|thinking.*tool/i.test(detail)
  )
    return {
      code: "MODEL_TOOL_MODE_INVALID",
      message: "工具调用与思考模式不兼容，请重新规划任务；已完成步骤保留",
    };
  if (/context|token.*limit|maximum.*token|too many tokens/i.test(detail))
    return {
      code: "MODEL_CONTEXT_LIMIT",
      message:
        "此步骤的资料超出模型上下文，请减少资料或分批处理；已完成步骤保留",
    };
  if (param === "model" || /model.*(?:not|invalid|support)/i.test(detail))
    return {
      code: "MODEL_NOT_SUPPORTED",
      message: "当前模型不支持此任务，请在设置中选择兼容模型后重试",
    };
  if (/file_id|file.*(?:expired|not found|invalid)/i.test(detail))
    return {
      code: "MODEL_FILE_REFERENCE_INVALID",
      message: "远端文件引用无效或已过期，请重新识别此文件",
    };
  return {
    code: "MODEL_REQUEST_INVALID",
    message: "DeepSeek 未接受此步骤的请求，请查看任务阶段与错误编号后重试",
  };
}
