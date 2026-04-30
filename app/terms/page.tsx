import Link from "next/link";

export const metadata = {
  title: "Terms of Use – GolfCaddy",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-green-700 text-white px-6 py-4 flex items-center justify-between">
        <Link href="/" className="font-bold text-lg">⛳ GolfCaddy</Link>
        <Link href="/signin" className="text-sm text-green-200 hover:text-white">Sign in</Link>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-12 space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Terms of Use</h1>
          <p className="text-gray-500 text-sm mt-2">Last updated: 30 April 2026</p>
        </div>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-gray-800">1. Acceptance</h2>
          <p className="text-gray-600 leading-relaxed">
            By accessing or using GolfCaddy (&ldquo;the Service&rdquo;) at{" "}
            <a href="https://golfcaddy.club" className="text-green-700 underline">golfcaddy.club</a>,
            you agree to be bound by these Terms of Use. If you do not agree, do not use the Service.
          </p>
          <p className="text-gray-600 leading-relaxed">
            GolfCaddy is operated by <strong>Paul Nasrallah</strong> (ABN: <strong>50 329 199 579</strong>),
            a sole trader based in Victoria, Australia.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-gray-800">2. The Service</h2>
          <p className="text-gray-600 leading-relaxed">
            GolfCaddy is a private golf group management platform that allows group administrators
            to manage members, record rounds, calculate handicaps, and run competitions. Access is
            by invitation from a group administrator only.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-gray-800">3. Accounts</h2>
          <ul className="list-disc list-inside space-y-1 text-gray-600">
            <li>You must be at least 16 years of age to create an account.</li>
            <li>You are responsible for maintaining the confidentiality of your login credentials.</li>
            <li>You must provide accurate information when creating your account.</li>
            <li>One person may not maintain multiple accounts.</li>
            <li>You are responsible for all activity that occurs under your account.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-gray-800">4. Subscriptions and billing</h2>
          <p className="text-gray-600 leading-relaxed">
            Group administrators may subscribe to a paid plan (Starter, Club, or Society) to unlock
            additional features and member limits. Subscriptions are billed monthly in Australian
            dollars (AUD) and renew automatically unless cancelled.
          </p>
          <ul className="list-disc list-inside space-y-1 text-gray-600">
            <li>Payments are processed by Stripe. By subscribing you agree to Stripe&apos;s terms.</li>
            <li>You may cancel your subscription at any time via the billing portal. Cancellation takes effect at the end of the current billing period.</li>
            <li>We do not offer refunds for partial billing periods unless required by Australian Consumer Law.</li>
            <li>We reserve the right to change subscription pricing with 30 days&apos; notice.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-gray-800">5. Acceptable use</h2>
          <p className="text-gray-600 leading-relaxed">You agree not to:</p>
          <ul className="list-disc list-inside space-y-1 text-gray-600">
            <li>Use the Service for any unlawful purpose</li>
            <li>Upload false or misleading golf scores or handicap data</li>
            <li>Harass, abuse, or harm other users</li>
            <li>Attempt to gain unauthorised access to any part of the Service</li>
            <li>Scrape, reverse engineer, or reproduce any part of the platform</li>
            <li>Use the Service to distribute spam or unsolicited communications</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-gray-800">6. Content</h2>
          <p className="text-gray-600 leading-relaxed">
            You retain ownership of any content you upload (photos, profile information). By uploading
            content, you grant GolfCaddy a non-exclusive licence to store and display that content
            to members of your group as part of the Service.
          </p>
          <p className="text-gray-600 leading-relaxed">
            You must not upload content that is offensive, defamatory, or infringes the rights of others.
            We reserve the right to remove any content that violates these terms.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-gray-800">7. Availability</h2>
          <p className="text-gray-600 leading-relaxed">
            We aim to keep GolfCaddy available at all times but do not guarantee uninterrupted access.
            We may perform maintenance, updates, or experience outages outside our control.
            We will not be liable for any loss resulting from downtime.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-gray-800">8. Limitation of liability</h2>
          <p className="text-gray-600 leading-relaxed">
            To the maximum extent permitted by Australian law, GolfCaddy is provided &ldquo;as is&rdquo;
            without warranties of any kind. We are not liable for any indirect, incidental, or
            consequential damages arising from your use of the Service.
          </p>
          <p className="text-gray-600 leading-relaxed">
            Nothing in these terms excludes, restricts, or modifies any rights you may have under
            the Australian Consumer Law.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-gray-800">9. Termination</h2>
          <p className="text-gray-600 leading-relaxed">
            We reserve the right to suspend or terminate accounts that violate these terms, without
            notice. You may delete your account at any time by contacting us at{" "}
            <a href="mailto:hello@golfcaddy.club" className="text-green-700 underline">hello@golfcaddy.club</a>.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-gray-800">10. Governing law</h2>
          <p className="text-gray-600 leading-relaxed">
            These terms are governed by the laws of Victoria, Australia. Any disputes will
            be subject to the exclusive jurisdiction of the courts of Victoria.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-gray-800">11. Changes to these terms</h2>
          <p className="text-gray-600 leading-relaxed">
            We may update these Terms of Use from time to time. Continued use of the Service after
            changes are posted constitutes acceptance of the updated terms. We will notify users of
            material changes via email or in-app notification.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-gray-800">12. Contact</h2>
          <p className="text-gray-600 leading-relaxed">
            Questions about these terms? Contact us at{" "}
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
