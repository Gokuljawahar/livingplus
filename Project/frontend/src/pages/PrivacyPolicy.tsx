import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield } from 'lucide-react';

export default function PrivacyPolicy() {
  const navigate = useNavigate();

  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <div className="min-h-screen bg-[#F8FAFB]">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-emerald-50 rounded-xl flex items-center justify-center">
              <Shield className="w-5 h-5 text-[#02224B]" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900">Privacy Policy</h1>
              <p className="text-xs text-slate-400">Living Plus</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 pb-16">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 sm:p-10 space-y-8">

          <div>
            <p className="text-sm text-slate-500 leading-relaxed">
              Please read this privacy policy carefully. By accessing or using the website/mobile application, you agree to be bound by the terms described herein. If you do not agree to all of these terms, please do not use the website/mobile application. Using the website/mobile application will be considered as a deemed acceptance of this policy.
            </p>
          </div>

          <Section title="Content & Purpose">
            <p>
              This Privacy Policy applies to your use of the PG Booking & Management Platform website and its related applications (collectively, the "Platform").
            </p>
            <p>
              The Platform helps guests discover PG properties and submit booking requests, and helps owners and authorized staff manage properties, beds, tenants, maintenance, and rent records (the "Services").
            </p>
            <p>
              For the purpose of providing the Services and for other purposes identified in this Privacy Policy, we will be required to collect and host certain data and information of the Users. We are committed to protecting the Personal Information of the Users and take all reasonable precautions for maintaining confidentiality of the User's Personal Information.
            </p>
            <p>This Privacy Policy has been designed to help you understand the following:</p>
            <ol className="list-decimal list-inside space-y-1 ml-2">
              <li>The type of Personal Information (including Sensitive Personal Data or Information) that we collect from the Users;</li>
              <li>The purpose of collection, means and modes of usage of such Personal Information by the Company;</li>
              <li>How and to whom the Company will disclose such information;</li>
              <li>How the Company will protect the Personal Information collected from the Users; and</li>
              <li>How Users may access and/or modify their Personal Information.</li>
            </ol>
          </Section>

          <Section title="Personal Information">
            <p>
              <strong>"Personal Information"</strong> means any information that relates to a natural person, which, either directly or indirectly, in combination with other information available with the Company, is capable of identifying the person concerned.
            </p>
            <p>
              <strong>"Sensitive Personal Data or Information"</strong> means Personal Information relating to password; financial information such as bank account or credit card or debit card or other payment instrument details; physical, physiological and mental health condition; sexual orientation; medical records and history; biometric information; and any detail relating to the above.
            </p>
            <p>As part of the registration process, we may collect the following categories of Personal Information:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Name</li>
              <li>User ID</li>
              <li>Email address</li>
              <li>Address (including country and ZIP/postal code)</li>
              <li>Gender</li>
              <li>Age</li>
              <li>Phone Number</li>
              <li>Password chosen by the User</li>
              <li>Valid financial account information</li>
              <li>Other details as the User may volunteer</li>
            </ul>
            <p>We may also receive and/or hold information about the User's browsing history including the URL of the site that the User visited prior to visiting the website, as well as the Internet Protocol (IP) address, computer operating system and type of web browser the User is using. The Website uses temporary cookies to store certain non-sensitive data for technical administration, research and development, and User administration.</p>
            <p>We do not knowingly collect Personal Information from children.</p>
          </Section>

          <Section title="Purposes for Which the Company May Use the Information">
            <p>We will retain User Information only to the extent necessary to provide Services to the Users. The information we collect may be utilized for various business and/or regulatory purposes including:</p>
            <ol className="list-decimal list-inside space-y-1 ml-2">
              <li>Registration of the User on the Website;</li>
              <li>Processing property enquiries, booking requests, and tenancy records;</li>
              <li>Recording rent, deposits, and property charges when directed by an authorized property user;</li>
              <li>Technical administration and customization of Website;</li>
              <li>Ensuring that the Website content is presented to the Users in an effective manner;</li>
              <li>Delivery of personalized information and target advertisements to the User;</li>
              <li>Improvement of Services, features and functionality of the Website;</li>
              <li>Research and development and for User administration;</li>
              <li>Non-personally identifiable information may be used in an aggregated form for internal research and statistical analysis purposes;</li>
              <li>Dealing with requests, enquiries, complaints or disputes and other customer care related activities;</li>
              <li>Communicating any changes in our Services or this Privacy Policy or the Terms of Use to the Users;</li>
              <li>Verification of identity of Users and performing checks to prevent frauds; and</li>
              <li>Investigating, enforcing, resolving disputes and applying our Terms of Use and Privacy Policy.</li>
            </ol>
          </Section>

          <Section title="Disclosure and Transfer of User's Personal Information">
            <p>
              We may need to disclose/transfer User's Personal Information to third parties for the purposes mentioned in this Privacy Policy and the Terms of Use. All employees and data processors who have access to, and are associated with the processing of User Information, are obliged to respect its confidentiality.
            </p>
            <p>
              Non-personally identifiable information may be disclosed to third party ad servers, ad agencies, technology vendors and research firms to serve advertisements to the Users.
            </p>
            <p>
              We may also disclose or transfer the User Information to another third party as part of reorganization or a sale of the assets or business of Company. Any third party to which the Company transfers or sells its assets will have the right to continue to use the Personal Information provided by Users.
            </p>
          </Section>

          <Section title="Links to Third-Party">
            <p>
              Advertisements, third party websites or any third party electronic communication services may be provided on the Website which are operated by third parties and are not controlled by, or affiliated to, or associated with the Company unless expressly specified on the Website. If you access any such Third Party Links, we request you review the website's privacy policy. We are not responsible for the policies or practices of Third Party Links.
            </p>
          </Section>

          <Section title="Security Practices and Procedures">
            <p>
              Reasonable security practices and procedures including technical, operational, managerial and physical security control measures are maintained in order to protect Personal Information from loss, misuse and unauthorized access, disclosure, alteration and destruction.
            </p>
            <p>
              The Company takes adequate steps to ensure that third parties to whom Users' Sensitive Personal Data or Information may be transferred adopt reasonable levels of security practices and procedures.
            </p>
            <p>
              You hereby acknowledge that the Company is not responsible for any intercepted information sent via the internet, and you hereby release us from any and all claims arising out of or related to the use of intercepted information in any unauthorized manner.
            </p>
          </Section>

          <Section title="User's Rights in Relation to Their Personal Information">
            <p>
              All information provided to the Company by a User, including Sensitive Personal Data or Information, is voluntary. Users have the right to withdraw consent at any time, but please note that withdrawal of consent will not be retroactive.
            </p>
            <p>
              Users can access, modify, correct and delete the Personal Information provided by them. Users may exercise these rights by reaching out to our support team and communicating the change(s) for updating the Company's records.
            </p>
            <p>
              In case the User does not provide information or consent for usage of Personal Information or subsequently withdraws consent, the Company reserves the right to discontinue the services for which the said information was sought.
            </p>
          </Section>

          <div className="pt-4 border-t border-slate-100">
            <p className="text-xs text-slate-400 text-center">
              For any questions regarding this Privacy Policy, please reach out to our support team.
            </p>
          </div>
        </div>
      </div>
    </div>
  ); 
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h2 className="text-base font-bold text-slate-900 border-l-4 border-[#FEB109] pl-3">{title}</h2>
      <div className="text-sm text-slate-600 leading-relaxed space-y-3 pl-1">
        {children}
      </div>
    </div>
  );
}
