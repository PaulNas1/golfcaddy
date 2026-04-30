export default function CheckoutCancelledPage() {
  return (
    <div className="min-h-screen bg-green-700 flex items-center justify-center px-6">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full text-center space-y-5">
        <div className="text-5xl">⛳</div>

        <div>
          <h1 className="text-xl font-bold text-gray-900">Checkout cancelled</h1>
          <p className="text-gray-500 text-sm mt-2">
            No payment was taken. Return to the app to choose a plan whenever you&apos;re ready.
          </p>
        </div>

        <a
          href="https://golfcaddy.club/admin/settings"
          className="block w-full bg-green-700 text-white font-semibold py-3 rounded-xl text-sm hover:bg-green-800 transition-colors"
        >
          Back to Settings
        </a>
      </div>
    </div>
  );
}
