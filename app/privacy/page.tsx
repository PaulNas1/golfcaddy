import Link from "next/link";

export const metadata = {
  title: "Privacy Policy – GolfCaddy",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-green-700 text-white px-6 py-4 flex items-center justify-between">
        <Link href="/" className="font-bold text-lg">⛳ GolfCaddy</Link>
        <Link href="/signin" className="text-sm text-green-200 hover:text-white">Sign in</Link>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-12 space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Privacy Policy</h1>
          <p className="text-gray-500 text-sm mt-2">Last updated: 30 April 2026</p>
        </div>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-gray-800">1. Who we are</h2>
          <p className="text-gray-600 leading-relaxed">
            GolfCaddy is operated by <strong>Paul Nasrallah</strong> (ABN: <strong>50 329 199 579</strong>),
            a sole trader based in Victoria, Australia. We provide a private golf group management platform at{" "}
            <a href="https://golfcaddy.club" className="text-green-700 underline">golfcaddy.club</a>.
          </p>
          <p className="text-gray-600 leading-relaxed">
            Contact us at:{" "}
            <a href="mailto:hello@golfcaddy.club" className="text-green-700 underline">hello@golfcaddy.club</a>
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-gray-800">2. What information we collect</h2>
          <p className="text-gray-600 leading-relaxed">We collect the following personal information:</p>
          <ul className="list-disc list-inside space-y-1 text-gray-600">
            <li>Name and email address (when you create an account)</li>
            <li>Mobile number and date of birth (optional, provided during signup)</li>
            <li>Golf handicap and round scores (entered by you or your group admin)</li>
            <li>Profile photo (optional, uploaded by you)</li>
            <li>Payment information (processed securely by Stripe — we do not store card details)</li>
            <li>Device push notification tokens (if you enable notifications)</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-gray-800">3. How we use your information</h2>
          <p className="text-gray-600 leading-relaxed">We use your information to:</p>
          <ul className="list-disc list-inside space-y-1 text-gray-600">
            <li>Provide and operate the GolfCaddy platform</li>
            <li>Calculate and display golf handicaps and leaderboards</li>
            <li>Send in-app and push notifications relevant to your group</li>
            <li>Process subscription payments</li>
            <li>Respond to support requests</li>
            <li>Improve the platform based on usage patterns</li>
          </ul>
          <p className="text-gray-600 leading-relaxed">
            We do not sell your personal information to third parties.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-gray-800">4. Third-party services</h2>
          <p className="text-gray-600 leading-relaxed">We use the following third-party services to operate GolfCaddy:</p>
          <ul className="list-disc list-inside space-y-1 text-gray-600">
            <li><strong>Google Firebase</strong> — authentication, database, and file storage (Google LLC, USA)</li>
            <li><strong>Stripe</strong> — payment processing (Stripe, Inc., USA)</li>
            <li><strong>Vercel</strong> — application hosting (Vercel, Inc., USA)</li>
          </ul>
          <p className="text-gray-600 leading-relaxed">
            Each of these services processes data in accordance with their own privacy policies.
            Data may be stored and processed in the United States or other countries.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-gray-800">5. Data retention</h2>
          <p className="text-gray-600 leading-relaxed">
            We retain your personal information for as long as your account is active or as needed
            to provide services. If you request account deletion, we will remove your personal data
            within 30 days, except where we are required by law to retain it (e.g. financial records).
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-gray-800">6. Your rights</h2>
          <p className="text-gray-600 leading-relaxed">You have the right to:</p>
          <ul className="list-disc list-inside space-y-1 text-gray-600">
            <li>Access the personal information we hold about you</li>
            <li>Request correction of inaccurate information</li>
            <li>Request deletion of your account and personal data</li>
            <li>Opt out of non-essential communications</li>
          </ul>
          <p className="text-gray-600 leading-relaxed">
            To exercise any of these rights, contact us at{" "}
            <a href="mailto:hello@golfcaddy.club" className="text-green-700 underline">hello@golfcaddy.club</a>.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-gray-800">7. Security</h2>
          <p className="text-gray-600 leading-relaxed">
            We take reasonable steps to protect your personal information from misuse, loss, and
            unauthorised access. All data is transmitted over HTTPS and stored in secured cloud
            infrastructure. Payment data is handled exclusively by Stripe and never stored on our servers.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-gray-800">8. Cookies</h2>
          <p className="text-gray-600 leading-relaxed">
            GolfCaddy is a Progressive Web App and does not use advertising or tracking cookies.
            We use browser storage (localStorage and IndexedDB) solely to maintain your login session
            and app preferences.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-gray-800">9. Changes to this policy</h2>
          <p className="text-gray-600 leading-relaxed">
            We may update this Privacy Policy from time to time. We will notify users of material
            changes via email or an in-app notification. Continued use of GolfCaddy after changes
            constitutes acceptance of the updated policy.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-gray-800">10. Contact</h2>
          <p className="text-gray-600 leading-relaxed">
            For any privacy-related queries, contact us at{" "}
            <a href="mailto:hello@golfcaddy.club" className="text-green-700 underline">hello@golfcaddy.club</a>.
          </p>
        </section>

        <div className="border-t border-gray-200 pt-6 flex gap-4 text-sm text-gray-500">
          <Link href="/terms" className="hover:text-gray-700">Terms of Use</Link>
          <Link href="/privacy" className="hover:text-gray-700">Privacy Policy</Link>
        </div>
      </main>
    </div>
  );
}
