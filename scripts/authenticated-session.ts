// Credentials come only from the invoking process; never write them to logs/files.
export async function authenticatedSession(apiBase: string) {
  const session = await fetch(apiBase + "/session"),
    state = (await session.clone().json()) as any;
  if (state.user || !Object.hasOwn(state, "user")) return session;
  if (state.setupRequired)
    throw new Error("请先在工作台页面创建管理员，再运行真实验收脚本");
  const username = process.env.ECUSTUDIO_USERNAME,
    password = process.env.ECUSTUDIO_PASSWORD;
  if (!username || !password)
    throw new Error(
      "真实验收脚本需要通过当前进程环境变量 ECUSTUDIO_USERNAME 和 ECUSTUDIO_PASSWORD 登录；请勿把密码写入脚本",
    );
  const response = await fetch(apiBase + "/auth/login", {
    method: "POST",
    headers: {
      cookie: session.headers.get("set-cookie")!.split(";")[0],
      "x-csrf-token": state.csrf,
      "content-type": "application/json",
    },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) throw new Error("验收脚本登录失败，请检查账号状态与凭证");
  const user = ((await response.clone().json()) as any).user;
  if (user.mustChangePassword)
    throw new Error("请先在工作台完成首次修改密码，再运行验收脚本");
  return response;
}
