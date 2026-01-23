import Link from 'next/link';

/**
 * Email Verification Error Page
 * Shown when email verification fails (invalid or expired token)
 */

export default function VerifyEmailErrorPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="bg-slate-800 rounded-lg border border-slate-700 p-8 max-w-md w-full text-center">
        <div className="mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-red-500/20 rounded-full mb-4">
            <svg
              className="w-8 h-8 text-red-400"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Verification Failed</h1>
          <p className="text-slate-400">
            The email verification link is invalid or has expired. Please try signing up again or request a new verification email.
          </p>
        </div>

        <div className="space-y-4">
          <Link
            href="/auth/signup"
            className="block bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded transition"
          >
            Sign Up Again
          </Link>
          <Link
            href="/"
            className="block bg-slate-700 hover:bg-slate-600 text-white font-medium py-2 px-4 rounded transition"
          >
            Back to Home
          </Link>
        </div>

        <div className="mt-6 pt-6 border-t border-slate-700">
          <p className="text-sm text-slate-400 mb-3">Need help?</p>
          <Link
            href="mailto:support@nexustrading.com"
            className="text-blue-400 hover:text-blue-300 transition text-sm"
          >
            Contact Support
          </Link>
        </div>
      </div>
    </div>
  );
}
