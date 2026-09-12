type Props = {
  searchParams: Promise<{ error?: string; setup?: string; next?: string }>;
};

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams;
  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="login-mark">N</div>
        <p className="login-kicker">NATHAN — COMMAND CENTRE</p>
        <h1>Welcome back.</h1>
        <p className="login-copy">Your projects, priorities and Jarvis are private.</p>
        {params.setup ? <p className="login-alert">The owner password has not been configured yet.</p> : null}
        {params.error ? <p className="login-alert">That password wasn’t right. Try again.</p> : null}
        <form action="/api/auth/login" method="post">
          <input type="hidden" name="next" value={params.next || "/"} />
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required autoFocus />
          <button type="submit">Open Command Centre</button>
        </form>
      </section>
    </main>
  );
}
