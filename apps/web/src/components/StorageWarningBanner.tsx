import { useState } from 'react'

interface StorageWarningBannerProps {
  message: string
}

export function StorageWarningBanner({ message }: StorageWarningBannerProps): JSX.Element | null {
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 dark:border-yellow-800">
      <div className="max-w-7xl mx-auto px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between flex-wrap">
          <div className="flex items-center flex-1">
            <span className="flex p-2 rounded-lg bg-yellow-100 dark:bg-yellow-900/40">
              <svg
                className="h-5 w-5 text-yellow-600 dark:text-yellow-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </span>
            <p className="ml-3 text-sm font-medium text-yellow-800 dark:text-yellow-200">
              {message}
            </p>
          </div>
          <button
            onClick={() => setDismissed(true)}
            className="flex-shrink-0 ml-3 inline-flex text-yellow-600 dark:text-yellow-400 hover:text-yellow-500 dark:hover:text-yellow-300 focus:outline-none"
            aria-label="Dismiss"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
