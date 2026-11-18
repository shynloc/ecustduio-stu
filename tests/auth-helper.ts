export const testAccount = {
  username: "test-admin",
  displayName: "隔离测试管理员",
  password: "Test-only-password-2026!",
};
export async function setupBrowser(page: any, url: string) {
  const state = await page.request.get(url + "/api/session");
  const session = await state.json();
  const r = await page.request.post(
    url + (session.setupRequired ? "/api/auth/setup" : "/api/auth/login"),
    {
      headers: { "x-csrf-token": session.csrf },
      data: session.setupRequired
        ? testAccount
        : { username: testAccount.username, password: testAccount.password },
    },
  );
  if (!r.ok()) throw new Error("test login failed: " + (await r.text()));
  await page.goto(url);
}
export async function setupInjected(app: any, host = "localhost") {
  const s = await app.inject({ url: "/api/session", headers: { host } }),
    cookie = String(s.headers["set-cookie"]).split(";")[0];
  const r = await app.inject({
    method: "POST",
    url: "/api/auth/setup",
    headers: { host, cookie, "x-csrf-token": s.json().csrf },
    payload: testAccount,
  });
  if (r.statusCode !== 200) throw new Error("test setup failed " + r.body);
  return {
    cookie: String(r.headers["set-cookie"]).split(";")[0],
    csrf: r.json().csrf,
  };
}
export async function loginInjected(app: any, host = "localhost") {
  const s = await app.inject({ url: "/api/session", headers: { host } }),
    cookie = String(s.headers["set-cookie"]).split(";")[0];
  const r = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    headers: { host, cookie, "x-csrf-token": s.json().csrf },
    payload: { username: testAccount.username, password: testAccount.password },
  });
  if (r.statusCode !== 200) throw new Error("test login failed " + r.body);
  return {
    cookie: String(r.headers["set-cookie"]).split(";")[0],
    csrf: r.json().csrf,
  };
}
