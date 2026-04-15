import { Link } from 'react-router-dom';

//This is a placeholder for the password reset page where the user would use a token to verify identity sent to them via email and then be able to reset their password.
const reset_password_explanation =
  'The user would be able to recieve an email with a token that they would use to reset their password by verifying its them';

//This functions cotains the link tht redirects the user back to the signin page for login.
export function ResetPassword() {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-slate-200">
      <main className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-8">
        <header className="text-center mb-6">
          <h1 className="text-2xl font-bold text-white uppercase tracking-widest">Forgot password</h1>
        </header>
        <textarea
          readOnly
          rows={4}
          value={reset_password_explanation}
          className="w-full bg-slate-950 border border-slate-800 p-4 rounded-lg text-sm text-slate-300 leading-relaxed resize-none outline-none cursor-default"
        />
        <Link to="/" className="mt-6 block text-center text-sm text-slate-400 hover:text-sky-400">
          Sign in
        </Link>
      </main>
    </div>
  );
}
