import Link from 'next/link';

/**
 * Email Verification Success Page
 * Shown after user successfully verifies their email
 */

export default function VerifyEmailSuccessPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="bg-slate-800 rounded-lg border border-slate-700 p-8 max-w-md w-full text-center">
        <div className="mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-green-500/20 rounded-full mb-4">
            <svg
              className="w-8 h-8 text-green-400"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Email Verified!</h1>
          <p className="text-slate-400">
            Your email has been successfully verified. You can now sign in to your account.
          </p>
        </div>

        <div className="space-y-4">
          <Link
            href="/auth/signin"
            className="block bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded transition"
          >
            Sign In
          </Link>
          <Link
            href="/"
            className="block bg-slate-700 hover:bg-slate-600 text-white font-medium py-2 px-4 rounded transition"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
