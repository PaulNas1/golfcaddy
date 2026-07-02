import LegalPageLayout from "@/components/marketing/LegalPageLayout";

export const metadata = {
  title: "Terms of Use – GolfCaddy",
};

export default function TermsPage() {
  return (
    <LegalPageLayout
      activeTab="terms"
      title="Terms of Use"
      updated="1 July 2026"
      intro={
        'These Terms of Use govern your access to and use of the GolfCaddy application and website at golfcaddy.club (the "Service"), operated by GolfCaddy. By creating an account, joining a group, or otherwise using the Service, you agree to be bound by these Terms. If you are setting up a group on behalf of a golf society or club, you accept these Terms on its behalf.'
      }
      contactHeading="Questions about these Terms?"
      contactBody="If anything here is unclear, or you need to reach us about your account or a group you manage, get in touch and we'll help."
      sections={[
        {
          num: "1",
          heading: "Your account",
          paras: [
            "To use most features you must create an account and keep your login details secure. You are responsible for activity that happens under your account.",
            "You must be at least 16 years old to create an account. Group administrators are responsible for ensuring their members meet this requirement.",
          ],
        },
        {
          num: "2",
          heading: "Groups, rounds and member data",
          paras: [
            "GolfCaddy is built for running social golf groups — organising rounds and tee times, recording scores, calculating handicaps and maintaining a season ladder.",
            "Group administrators can invite members, schedule rounds and manage settings. If you are an administrator, you agree to only add members who have consented to join, and to handle their information responsibly.",
          ],
        },
        {
          num: "3",
          heading: "Acceptable use",
          paras: ["You agree to use the Service lawfully and respectfully. In particular, you must not:"],
          bullets: [
            "Upload content that is unlawful, abusive, harassing or infringes someone else's rights.",
            "Attempt to access accounts, groups or data that are not yours.",
            "Interfere with, disrupt, or reverse-engineer the Service or its security.",
            "Use the Service to send spam or unsolicited messages to members.",
          ],
        },
        {
          num: "4",
          heading: "Scores, handicaps and results",
          paras: [
            "Handicaps, Stableford points, countback tie-breaks and ladder standings are calculated automatically from the scores entered by members. While we work to keep these calculations accurate, GolfCaddy is a tool for social play and is not an official handicapping authority. Groups are responsible for the scores they record and for resolving any disputes about results.",
          ],
        },
        {
          num: "5",
          heading: "Subscriptions and billing",
          paras: [
            "Paid plans are billed per group based on the plan you select. Every plan includes a 30-day free trial with no card required to start.",
            "After the trial, subscriptions renew automatically for the billing period until cancelled. You can cancel at any time from your group settings; cancellation takes effect at the end of the current billing period, and fees already paid are non-refundable except where required by law.",
          ],
        },
        {
          num: "6",
          heading: "Your content",
          paras: [
            "You retain ownership of the content you and your members add — scores, photos, comments and group details. You grant GolfCaddy the limited licence needed to host, display and process that content so the Service can function for your group.",
          ],
        },
        {
          num: "7",
          heading: "Availability and changes",
          paras: [
            "We aim to keep the Service running reliably but do not guarantee it will be uninterrupted or error-free. We may update, add or remove features over time, and we may update these Terms; where changes are material, we'll give reasonable notice.",
          ],
        },
        {
          num: "8",
          heading: "Liability",
          paras: [
            'To the extent permitted by law, GolfCaddy is provided "as is" and we exclude implied warranties. Nothing in these Terms limits rights you have under the Australian Consumer Law that cannot lawfully be excluded. Our liability for any claim connected to the Service is limited to the amount you paid us in the 12 months before the claim.',
          ],
        },
        {
          num: "9",
          heading: "Termination",
          paras: [
            "You may stop using the Service and delete your account at any time. We may suspend or terminate access if these Terms are breached. On termination, the rights granted to you end, though provisions that by their nature should survive will continue to apply.",
          ],
        },
        {
          num: "10",
          heading: "Governing law",
          paras: [
            "These Terms are governed by the laws of Victoria, Australia, and you submit to the non-exclusive jurisdiction of the courts of that State.",
          ],
        },
      ]}
    />
  );
}
