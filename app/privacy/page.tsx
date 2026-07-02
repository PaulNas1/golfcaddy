import LegalPageLayout from "@/components/marketing/LegalPageLayout";

export const metadata = {
  title: "Privacy Policy – GolfCaddy",
};

export default function PrivacyPage() {
  return (
    <LegalPageLayout
      activeTab="privacy"
      title="Privacy Policy"
      updated="1 July 2026"
      intro="This Privacy Policy explains how GolfCaddy collects, uses and protects personal information when you use the app and website at golfcaddy.club. We handle personal information in accordance with the Australian Privacy Principles under the Privacy Act 1988 (Cth). By using the Service you agree to the practices described here."
      contactHeading="Privacy questions or requests"
      contactBody="To access or correct your information, make a privacy complaint, or ask how your data is handled, contact us and we'll respond promptly."
      sections={[
        {
          num: "1",
          heading: "Information we collect",
          paras: ["We collect information you provide and information generated as you use the Service, including:"],
          bullets: [
            "Account details — your name, email address and, optionally, a profile photo.",
            "Golf data — your rounds, scores, handicap, side-prize results and ladder standings.",
            "Group data — the groups you belong to and your role within them.",
            "Technical data — device, browser and usage information collected to keep the Service secure and reliable.",
          ],
        },
        {
          num: "2",
          heading: "How we use your information",
          paras: ["We use personal information to:"],
          bullets: [
            "Provide the Service — run rounds, calculate scores and handicaps, and maintain ladders.",
            "Manage your account, group membership and subscription.",
            "Communicate with you about rounds, updates and support.",
            "Keep the Service secure and improve how it works.",
          ],
        },
        {
          num: "3",
          heading: "Visibility within your group",
          paras: [
            "GolfCaddy is a group product. Information such as your name, scores, handicap and ladder position is visible to other members of the groups you join. Group administrators can see and manage member details needed to run the group. Your golf activity is not published publicly outside your group.",
          ],
        },
        {
          num: "4",
          heading: "Sharing with third parties",
          paras: [
            "We do not sell your personal information. We share it only with service providers who help us operate the Service — such as cloud hosting and payment processing — and only as needed for them to perform those services. We may disclose information where required by law.",
          ],
        },
        {
          num: "5",
          heading: "Data storage and security",
          paras: [
            "Your data is stored using reputable cloud infrastructure and protected with access controls and encryption in transit. Some providers may store data outside Australia; where that happens, we take reasonable steps to ensure it is handled consistently with the Australian Privacy Principles. No system is perfectly secure, but we work to protect your information from misuse, loss and unauthorised access.",
          ],
        },
        {
          num: "6",
          heading: "Your rights and choices",
          paras: ["You can:"],
          bullets: [
            "Access and update your account information at any time.",
            "Request a copy of the personal information we hold about you.",
            "Ask us to correct or delete your information, subject to legal and group-record requirements.",
            "Leave a group, which removes you from its future rounds and standings.",
          ],
        },
        {
          num: "7",
          heading: "Data retention",
          paras: [
            "We keep personal information for as long as your account is active and as needed to provide the Service. When you delete your account we remove or de-identify your personal information within a reasonable period, except where we must retain it to meet legal obligations or resolve disputes.",
          ],
        },
        {
          num: "8",
          heading: "Cookies and local storage",
          paras: [
            "The app uses cookies and local storage to keep you signed in, remember preferences, and understand how the Service is used. You can control cookies through your browser, though some features may not work without them.",
          ],
        },
        {
          num: "9",
          heading: "Children",
          paras: [
            "The Service is not intended for children under 16. We do not knowingly collect personal information from children under that age.",
          ],
        },
        {
          num: "10",
          heading: "Changes to this policy",
          paras: [
            'We may update this Privacy Policy from time to time. Where changes are material, we\'ll notify you through the app or by email. The "last updated" date above reflects the current version.',
          ],
        },
      ]}
    />
  );
}
